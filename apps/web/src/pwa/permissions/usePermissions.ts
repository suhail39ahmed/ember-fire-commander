import { useCallback, useEffect, useRef, useState } from 'react'
import { askPermission, browserEnv, PERM_KEYS, queryName, readPerms, type PermKey, type PermState, type Perms } from './permState'

export type { PermKey, PermState, Perms }
export type Asking = Partial<Record<PermKey, boolean>>

/** If a browser leaves its prompt pending when it is dismissed, stop showing Asking after this long. */
export const ASKING_TIMEOUT_MS = 45_000

const INITIAL: Perms = { microphone: 'prompt', camera: 'prompt', location: 'prompt', notifications: 'prompt' }

/**
 * Shows permission states BEFORE use, lets the user request each one, and keeps
 * the rows live: the browser's change events, the tap result and coming back from
 * the browser settings all update them without a reload.
 */
export function usePermissions() {
  const [perms, setPerms] = useState<Perms>(INITIAL)
  const [asking, setAsking] = useState<Asking>({})
  const learned = useRef<Partial<Perms>>({})
  const inFlight = useRef<Asking>({})
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    const next = await readPerms(browserEnv(), learned.current)
    if (mounted.current) setPerms(next)
  }, [])

  useEffect(() => {
    mounted.current = true
    void refresh()

    const cleanups: Array<() => void> = []
    let active = true
    const permissions = typeof navigator === 'undefined' ? undefined : navigator.permissions
    if (permissions?.query) {
      for (const key of PERM_KEYS) {
        permissions
          .query({ name: queryName(key) as PermissionName })
          .then((status) => {
            if (!active) return
            const onChange = () => void refresh()
            status.addEventListener('change', onChange)
            cleanups.push(() => status.removeEventListener('change', onChange))
          })
          .catch(() => undefined) // this browser cannot report this permission; the Allow tap result is used instead
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      mounted.current = false
      active = false
      cleanups.forEach((fn) => fn())
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const request = useCallback(
    async (key: PermKey) => {
      if (inFlight.current[key]) return
      inFlight.current[key] = true
      setAsking((a) => ({ ...a, [key]: true }))
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const timeout = new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), ASKING_TIMEOUT_MS)
        })
        const outcome = await Promise.race([askPermission(key, browserEnv()), timeout])
        if (outcome) learned.current[key] = outcome
        await refresh() // update the row before Asking clears, so it never flashes back to Allow
      } finally {
        clearTimeout(timer)
        inFlight.current[key] = false
        if (mounted.current) setAsking((a) => ({ ...a, [key]: false }))
      }
    },
    [refresh],
  )

  return { perms, asking, request, refresh }
}

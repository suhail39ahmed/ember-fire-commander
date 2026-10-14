import { useCallback, useEffect, useState } from 'react'

export type PermState = 'granted' | 'prompt' | 'denied' | 'unsupported'
export type PermKey = 'microphone' | 'camera' | 'location' | 'notifications'
export type Perms = Record<PermKey, PermState>

const QUERY_NAME: Record<PermKey, string> = {
  microphone: 'microphone',
  camera: 'camera',
  location: 'geolocation',
  notifications: 'notifications',
}

function supported(key: PermKey): boolean {
  if (typeof navigator === 'undefined') return false
  if (key === 'notifications') return typeof Notification !== 'undefined'
  if (key === 'location') return 'geolocation' in navigator
  return !!navigator.mediaDevices?.getUserMedia
}

async function query(key: PermKey): Promise<PermState> {
  if (!supported(key)) return 'unsupported'
  if (key === 'notifications') {
    const p = Notification.permission
    return p === 'default' ? 'prompt' : p
  }
  try {
    const status = await navigator.permissions.query({ name: QUERY_NAME[key] as PermissionName })
    return status.state
  } catch {
    return 'prompt' // Permissions API missing (e.g. some iOS versions): unknown until asked
  }
}

/** Shows permission states BEFORE use and lets the user request each one. */
export function usePermissions() {
  const [perms, setPerms] = useState<Perms>({
    microphone: 'prompt',
    camera: 'prompt',
    location: 'prompt',
    notifications: 'prompt',
  })

  const refresh = useCallback(async () => {
    const keys = Object.keys(QUERY_NAME) as PermKey[]
    const values = await Promise.all(keys.map(query))
    setPerms(Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Perms)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const request = useCallback(
    async (key: PermKey) => {
      try {
        if (key === 'notifications') await Notification.requestPermission()
        else if (key === 'location')
          await new Promise((res) => navigator.geolocation.getCurrentPosition(res, res, { timeout: 10000 }))
        else {
          const stream = await navigator.mediaDevices.getUserMedia(key === 'camera' ? { video: true } : { audio: true })
          stream.getTracks().forEach((tr) => tr.stop())
        }
      } catch {
        /* denial is reflected by refresh() */
      }
      await refresh()
    },
    [refresh],
  )

  return { perms, request, refresh }
}

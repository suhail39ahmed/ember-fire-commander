import type { Me, MePatch } from '../../auth/api'
import type { EmberApi } from '../api/types'
import type { LanguageCode } from '../i18n'

/** Serialize preference writes so rapid choices cannot overwrite a newer server value. */
export function createProfileSettings(initial: Me | null, api: EmberApi, deviceLanguage: LanguageCode, setLanguage: (language: LanguageCode) => void) {
  let confirmed = initial
  let fallbackLanguage = initial?.language ?? deviceLanguage
  let snapshot = { me: initial, saving: false, error: false }
  const listeners = new Set<() => void>()
  const pending: MePatch[] = []
  let active = false

  function publish(error = false) {
    const me = confirmed ? Object.assign({}, confirmed, ...pending) as Me : null
    snapshot = { me, saving: pending.length > 0, error }
    if (active) setLanguage(me?.language ?? fallbackLanguage)
    listeners.forEach((listener) => listener())
  }

  async function drain() {
    while (pending.length) {
      let failed = false
      try {
        confirmed = await api.patchMe(pending[0])
        fallbackLanguage = confirmed.language ?? fallbackLanguage
      } catch {
        failed = true
      }
      pending.shift()
      publish(failed)
    }
  }

  return {
    get: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    connect: () => { active = true; setLanguage(confirmed?.language ?? fallbackLanguage); return () => { active = false } },
    update: (patch: MePatch) => {
      if (!confirmed || !active) return
      const running = pending.length > 0
      pending.push(patch)
      publish()
      if (!running) void drain()
    },
  }
}

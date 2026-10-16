import { useEffect } from 'react'
import type { User } from 'firebase/auth'

import { USE_MOCK_API } from '../api/config'
import type { PermState } from '../permissions/usePermissions'
import { registerPushFor } from './browser'
import { PUSH_CLICK, type PushData } from './target'

/**
 * Registers this phone for push once the user is signed in and has allowed
 * notifications. Does nothing while permission is not granted, so a denied or
 * unanswered prompt records nothing. `onOpen` runs with the tapped push's data when a
 * notification is tapped while the app is already open, so the app can refresh and open the task or WITHDRAW
 * screen straight away instead of on the next poll.
 */
export function usePushRegistration(user: User | null, permission: PermState, onOpen: (data: PushData | null) => void) {
  useEffect(() => {
    if (USE_MOCK_API || !user || permission !== 'granted') return
    void registerPushFor(user)
  }, [user, permission])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; data?: PushData } | null
      if (message?.type === PUSH_CLICK) onOpen(message.data ?? null)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [onOpen])
}

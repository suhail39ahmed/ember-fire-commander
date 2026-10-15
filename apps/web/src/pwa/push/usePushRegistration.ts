import { useEffect } from 'react'
import type { User } from 'firebase/auth'

import { USE_MOCK_API } from '../api/config'
import type { PermState } from '../permissions/usePermissions'
import { registerPushFor } from './browser'

/** Message the service worker posts to an open page when a notification is tapped. */
export const PUSH_CLICK = 'ember-push-click'

/**
 * Registers this phone for push once the user is signed in and has allowed
 * notifications. Does nothing while permission is not granted, so a denied or
 * unanswered prompt records nothing. `onOpen` runs when a notification is
 * tapped while the app is already open, so the task or WITHDRAW screen
 * refreshes straight away instead of on the next poll.
 */
export function usePushRegistration(user: User | null, permission: PermState, onOpen: () => void) {
  useEffect(() => {
    if (USE_MOCK_API || !user || permission !== 'granted') return
    void registerPushFor(user)
  }, [user, permission])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === PUSH_CLICK) onOpen()
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [onOpen])
}

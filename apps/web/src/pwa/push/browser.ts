import type { User } from 'firebase/auth'

import { firebaseApp } from '../../auth/firebase'
import { authHeadersFor } from '../api/authHeaders'
import { API_BASE_URL } from '../api/config'
import { registerPush, unregisterPush, type MessagingPort, type PushClient, type RegisterResult } from './pushClient'

const VAPID_KEY: string = import.meta.env.VITE_FIREBASE_VAPID_KEY || ''

/** Wait for the app-shell worker (public/sw.js) that also shows the notifications. Dev builds have none. */
function readyWorker(ms = 10000): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null)
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

/** firebase/messaging loads on demand so the supervisor console never downloads it. */
export const browserMessaging: MessagingPort = {
  async isSupported() {
    const { isSupported } = await import('firebase/messaging')
    return isSupported()
  },
  async getToken(vapidKey) {
    const sdk = await import('firebase/messaging')
    const serviceWorkerRegistration = await readyWorker()
    if (!serviceWorkerRegistration) return null
    return sdk.getToken(sdk.getMessaging(firebaseApp), { vapidKey, serviceWorkerRegistration })
  },
  async deleteToken() {
    const sdk = await import('firebase/messaging')
    await sdk.deleteToken(sdk.getMessaging(firebaseApp))
  },
}

function browserClient(user: User | null): PushClient {
  return {
    messaging: browserMessaging,
    getAuthHeaders: authHeadersFor(user),
    baseUrl: API_BASE_URL,
    vapidKey: VAPID_KEY,
    permission: () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission),
  }
}

export function registerPushFor(user: User): Promise<RegisterResult> {
  return registerPush(browserClient(user))
}

/** Called by sign-out while the ID token is still valid. */
export function unregisterPushFor(user: User | null): Promise<void> {
  return unregisterPush(browserClient(user))
}

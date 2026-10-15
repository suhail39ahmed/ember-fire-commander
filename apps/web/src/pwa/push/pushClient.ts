/**
 * Push registration for the volunteer app.
 *
 * The browser gets an FCM token and hands it to ember-api, which stores it in
 * volunteers/{uid}.fcmTokens. The browser never writes Firestore. Everything
 * here is best effort: a denied permission, a missing key or a failed request
 * leaves the app working and never throws.
 */
import type { AuthHeadersProvider } from '../api/authHeaders'

export const PUSH_TOKEN_PATH = '/notifications/token'
export const PUSH_TOKEN_KEY = 'ember.push.token'

/** What the Firebase messaging SDK has to do for us. Swapped for a double in tests. */
export interface MessagingPort {
  isSupported(): Promise<boolean>
  getToken(vapidKey: string): Promise<string | null>
  deleteToken(): Promise<void>
}

export interface PushClient {
  messaging: MessagingPort
  getAuthHeaders: AuthHeadersProvider
  baseUrl: string
  vapidKey: string
  permission: () => NotificationPermission | 'unsupported'
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export type RegisterResult = 'registered' | 'not-granted' | 'unsupported' | 'no-key' | 'failed'

function storage(client: PushClient) {
  return client.storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
}

async function callApi(client: PushClient, method: 'POST' | 'DELETE', token: string): Promise<boolean> {
  const auth = await client.getAuthHeaders()
  if (!auth) return false
  const send = client.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const res = await send(`${client.baseUrl}${PUSH_TOKEN_PATH}`, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ token }),
  })
  return res.ok
}

/** Ask FCM for this browser's token and send it to ember-api. Call only after the user allowed notifications. */
export async function registerPush(client: PushClient): Promise<RegisterResult> {
  try {
    if (!client.vapidKey) return 'no-key'
    if (client.permission() !== 'granted') return 'not-granted'
    if (!(await client.messaging.isSupported())) return 'unsupported'
    const token = await client.messaging.getToken(client.vapidKey)
    if (!token) return 'failed'
    if (!(await callApi(client, 'POST', token))) return 'failed'
    storage(client)?.setItem(PUSH_TOKEN_KEY, token)
    return 'registered'
  } catch {
    return 'failed'
  }
}

function within<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([work, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))])
}

/**
 * Sign-out: drop this browser's token from ember-api and from FCM, so the next
 * person on this phone does not receive the previous user's pushes. Only acts
 * when this browser registered a token. Bounded by a short timeout so sign-out is never held up.
 */
export async function unregisterPush(client: PushClient): Promise<void> {
  const store = storage(client)
  const token = store?.getItem(PUSH_TOKEN_KEY)
  if (!token) return
  const work = (async () => {
    try {
      await callApi(client, 'DELETE', token)
    } catch {
      // The token is dropped on the next send, when FCM reports it unregistered.
    }
    try {
      await client.messaging.deleteToken()
    } catch {
      // Nothing more to do on this device.
    }
  })()
  await within(work, client.timeoutMs ?? 4000)
  store?.removeItem(PUSH_TOKEN_KEY)
}

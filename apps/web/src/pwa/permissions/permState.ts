/**
 * Permission state helpers for the permissions card (#76). They take the browser
 * objects as an argument so the logic can be tested without a browser.
 */
export type PermState = 'granted' | 'prompt' | 'denied' | 'unsupported'
export type PermKey = 'microphone' | 'camera' | 'location' | 'notifications'
export type Perms = Record<PermKey, PermState>

export const PERM_KEYS: PermKey[] = ['microphone', 'camera', 'location', 'notifications']

const QUERY_NAME: Record<PermKey, string> = {
  microphone: 'microphone',
  camera: 'camera',
  location: 'geolocation',
  notifications: 'notifications',
}

export const queryName = (key: PermKey): string => QUERY_NAME[key]

interface TrackLike {
  stop(): void
}

export interface PermEnv {
  geolocation?: Pick<Geolocation, 'getCurrentPosition'>
  mediaDevices?: { getUserMedia?: (c: MediaStreamConstraints) => Promise<{ getTracks(): TrackLike[] }> }
  permissions?: { query(d: { name: PermissionName }): Promise<{ state: string }> }
  notification?: { permission: NotificationPermission; requestPermission(): Promise<NotificationPermission> | undefined }
}

export function browserEnv(): PermEnv {
  if (typeof navigator === 'undefined') return {}
  return {
    geolocation: navigator.geolocation,
    mediaDevices: navigator.mediaDevices,
    permissions: navigator.permissions,
    notification: typeof Notification === 'undefined' ? undefined : Notification,
  }
}

export function isSupported(key: PermKey, env: PermEnv): boolean {
  if (key === 'notifications') return !!env.notification
  if (key === 'location') return !!env.geolocation
  return !!env.mediaDevices?.getUserMedia
}

function fromNotification(p: NotificationPermission): PermState {
  return p === 'default' ? 'prompt' : p
}

/**
 * What the browser reports right now. null means it cannot tell (the Permissions API
 * is missing or rejects this name, as on Safari and iOS), so only an Allow tap can
 * teach us the answer.
 */
export async function queryPermission(key: PermKey, env: PermEnv): Promise<PermState | null> {
  if (!isSupported(key, env)) return 'unsupported'
  if (key === 'notifications') return fromNotification(env.notification!.permission)
  if (!env.permissions) return null
  try {
    const status = await env.permissions.query({ name: queryName(key) as PermissionName })
    return status.state === 'granted' || status.state === 'denied' || status.state === 'prompt' ? status.state : null
  } catch {
    return null
  }
}

/**
 * Ask the browser, then report what the tap told us. null means the tap proved
 * nothing (prompt dismissed, device busy, no fix yet), so the caller re-reads the state.
 */
export async function askPermission(key: PermKey, env: PermEnv): Promise<PermState | null> {
  if (!isSupported(key, env)) return 'unsupported'
  try {
    if (key === 'notifications') {
      // Older Safari takes a callback and returns undefined, so read the value back.
      const result = (await env.notification!.requestPermission()) ?? env.notification!.permission
      return fromNotification(result)
    }
    if (key === 'location') {
      return await new Promise<PermState | null>((resolve) =>
        env.geolocation!.getCurrentPosition(
          () => resolve('granted'),
          (err) => resolve(err.code === 1 ? 'denied' : null),
          { timeout: 10000 },
        ),
      )
    }
    const stream = await env.mediaDevices!.getUserMedia!(key === 'camera' ? { video: true } : { audio: true })
    stream.getTracks().forEach((track) => track.stop())
    return 'granted'
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
    if (name === 'NotFoundError') return 'unsupported'
    return null
  }
}

/** The browser's answer wins; what an Allow tap taught us fills in where the browser cannot tell. */
export async function readPerms(env: PermEnv, learned: Partial<Perms>): Promise<Perms> {
  const values = await Promise.all(PERM_KEYS.map(async (k) => (await queryPermission(k, env)) ?? learned[k] ?? 'prompt'))
  return Object.fromEntries(PERM_KEYS.map((k, i) => [k, values[i]])) as Perms
}

export type Platform = 'ios' | 'android' | 'other'

export function detectPlatform(ua?: string, maxTouchPoints?: number): Platform {
  const agent = ua ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent)
  const touch = maxTouchPoints ?? (typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints)
  if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && touch > 1)) return 'ios'
  if (/Android/.test(agent)) return 'android'
  return 'other'
}

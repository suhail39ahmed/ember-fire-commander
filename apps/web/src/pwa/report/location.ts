import type { Position } from './buildObservation'

/**
 * Result of asking the browser for the phone's position.
 * - `denied`: the volunteer (or a policy) blocked location. Only the browser settings can fix it.
 * - `unavailable`: there is no usable fix: no GPS, no geolocation support, or it took too long.
 * A prompt that is still open is not a result. The call keeps waiting for the answer.
 */
export type LocationResult = { kind: 'ok'; pos: Position } | { kind: 'denied' } | { kind: 'unavailable' }

/** The parts of the browser the location code touches, injectable for tests. */
export interface GeoEnv {
  geolocation: Pick<Geolocation, 'getCurrentPosition'> | null
  permissions: { query(descriptor: { name: 'geolocation' }): Promise<GeoPermissionStatus> } | null
}

export interface GeoPermissionStatus {
  state: string
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

export interface LocateOptions {
  /** Per-attempt timeout passed to the browser. Default 8 s. */
  timeoutMs?: number
  /** How many attempts to spend waiting on an open permission prompt before giving up. Default 8. */
  maxAttempts?: number
}

const PERMISSION_DENIED = 1
const TIMEOUT = 3

export function browserGeoEnv(): GeoEnv {
  if (typeof navigator === 'undefined') return { geolocation: null, permissions: null }
  return {
    geolocation: 'geolocation' in navigator ? navigator.geolocation : null,
    permissions: navigator.permissions ?? null,
  }
}

type Attempt = { ok: true; pos: Position } | { ok: false; code: number }

function attempt(geo: NonNullable<GeoEnv['geolocation']>, timeoutMs: number): Promise<Attempt> {
  return new Promise((resolve) =>
    geo.getCurrentPosition(
      (p) => resolve({ ok: true, pos: { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) } }),
      (e) => resolve({ ok: false, code: e.code }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    ),
  )
}

async function promptIsOpen(env: GeoEnv): Promise<boolean> {
  try {
    return (await env.permissions?.query({ name: 'geolocation' }))?.state === 'prompt'
  } catch {
    return false
  }
}

/**
 * Asks for the position. Some browsers run the timeout while the permission prompt is still on
 * screen, which used to look like a failure. A timeout while the prompt is still open means
 * "still waiting", so ask again. Only a real denial, a missing fix, or a timeout with no prompt
 * open is reported.
 */
export async function locate(env: GeoEnv = browserGeoEnv(), { timeoutMs = 8000, maxAttempts = 8 }: LocateOptions = {}): Promise<LocationResult> {
  const geo = env.geolocation
  if (!geo) return { kind: 'unavailable' }
  for (let n = 1; ; n++) {
    const r = await attempt(geo, timeoutMs)
    if (r.ok) return { kind: 'ok', pos: r.pos }
    if (r.code === PERMISSION_DENIED) return { kind: 'denied' }
    if (r.code === TIMEOUT && n < maxAttempts && (await promptIsOpen(env))) continue
    return { kind: 'unavailable' }
  }
}

/** The position, or null when it cannot be had. Used by the photo report. */
export async function getPosition(env?: GeoEnv, options?: LocateOptions): Promise<Position | null> {
  const r = await locate(env, options)
  return r.kind === 'ok' ? r.pos : null
}

/**
 * Calls `onGranted` when the location permission changes to granted, for example when the
 * volunteer allows it in the browser settings and returns to the page. Returns a function that
 * stops listening. Browsers that cannot report permission changes never call it.
 */
export function watchLocationGranted(onGranted: () => void, env: GeoEnv = browserGeoEnv()): () => void {
  let stopped = false
  let status: GeoPermissionStatus | null = null
  const onChange = () => {
    if (!stopped && status?.state === 'granted') onGranted()
  }
  env.permissions
    ?.query({ name: 'geolocation' })
    .then((s) => {
      if (stopped) return
      status = s
      s.addEventListener('change', onChange)
    })
    .catch(() => {})
  return () => {
    stopped = true
    status?.removeEventListener('change', onChange)
  }
}

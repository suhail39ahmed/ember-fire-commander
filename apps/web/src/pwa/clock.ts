import type { Digest } from './contracts/types'
import { strings, t, type Lang } from './i18n'

/**
 * Server time for report stamps. ember-api only accepts `capturedAt` from 7 days ago up to 5 minutes ahead of its
 * own clock, and a village phone's clock is often wrong. Every digest carries the server's `updatedAt`, so the app
 * keeps the gap between that and the phone clock and adds it to the time it stamps on a report.
 */
export const SKEW_KEY = 'ember.clock.skew'
/** A gap under a minute is ordinary network delay, not a wrong clock. */
export const MIN_SKEW_MS = 60_000
/** A measured gap older than this is not trusted any more. */
export const MAX_SKEW_AGE_MS = 7 * 24 * 60 * 60 * 1000

type Store = Pick<Storage, 'getItem' | 'setItem'>

function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Server time minus phone time, in ms, or null when the server time is not a valid timestamp. */
export function measureSkew(serverTime: string, receivedAt: Date): number | null {
  const server = Date.parse(serverTime)
  return Number.isFinite(server) ? server - receivedAt.getTime() : null
}

/** Remember the gap measured by a digest. The latest reading always wins, so a fixed clock clears an old gap. */
export function recordSkew(skewMs: number, measuredAt: Date, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(SKEW_KEY, JSON.stringify({ skewMs, at: measuredAt.toISOString() }))
  } catch {
    // Storage can be unavailable (private mode); the phone clock is then used as it is.
  }
}

export function recordDigestClock(digest: Pick<Digest, 'updatedAt'>, receivedAt: Date, store?: Store | null): void {
  const skew = measureSkew(digest.updatedAt, receivedAt)
  if (skew !== null) recordSkew(skew, receivedAt, store)
}

/** The gap to add to the phone clock. 0 when nothing trustworthy is stored or the gap is under a minute. */
export function currentSkew(now: Date = new Date(), store: Store | null = defaultStore()): number {
  try {
    const raw = store?.getItem(SKEW_KEY)
    if (!raw) return 0
    const saved = JSON.parse(raw) as { skewMs?: unknown; at?: unknown }
    if (typeof saved.skewMs !== 'number' || !Number.isFinite(saved.skewMs) || typeof saved.at !== 'string') return 0
    const age = now.getTime() - Date.parse(saved.at)
    if (!Number.isFinite(age) || age > MAX_SKEW_AGE_MS) return 0
    return Math.abs(saved.skewMs) >= MIN_SKEW_MS ? saved.skewMs : 0
  } catch {
    return 0
  }
}

/** The phone time stamped on a report, corrected towards the server clock. ISO string, UTC. */
export function stampNow(now: Date = new Date(), store?: Store | null): string {
  return new Date(now.getTime() + currentSkew(now, store)).toISOString()
}

/** True when ember-api refused a report because of its time (a `capturedAt` field error). */
export function isClockRejection(fields: Record<string, string> | undefined): boolean {
  return fields !== undefined && 'capturedAt' in fields
}

export function clockMessage(lang: Lang): string {
  return t(lang, strings.errClock)
}

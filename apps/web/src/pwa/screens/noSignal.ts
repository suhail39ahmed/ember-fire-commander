/** An instruction older than this puts the safety rule first on the no-signal card. */
export const STALE_AFTER_MS = 15 * 60 * 1000

/** Whole minutes since `sentAt`, or null when there is no usable time. Computed on the phone from the cached time. */
export function ageMinutes(sentAt: string | null | undefined, nowMs: number): number | null {
  if (!sentAt) return null
  const sent = Date.parse(sentAt)
  if (!Number.isFinite(sent)) return null
  return Math.max(0, Math.floor((nowMs - sent) / 60_000))
}

/**
 * True when the safety rule goes first: the instruction is older than 15 minutes, or its age is unknown (an
 * instruction with no send time is not trusted to be fresh).
 */
export function safetyFirst(sentAt: string | null | undefined, nowMs: number): boolean {
  const age = ageMinutes(sentAt, nowMs)
  return age === null || age * 60_000 >= STALE_AFTER_MS
}

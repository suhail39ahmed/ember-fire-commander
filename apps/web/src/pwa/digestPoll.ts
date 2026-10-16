import type { Digest } from './contracts/types'
import { ApiError } from './api/types'

/** How often the digest is read while the volunteer can see the app. */
export const POLL_MS = 5000
/** The longest wait between reads after repeated failures. */
export const MAX_BACKOFF_MS = 30000

/** Wait before the next read: 5 s, then 10 s, 20 s and never more than 30 s after consecutive failures. */
export function nextDelay(failures: number): number {
  if (failures <= 0) return POLL_MS
  return Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS)
}

/** 'refused' is an answer retrying will not change by itself (signed out, no access); 'unreachable' can pass. */
export type PollFailure = 'unreachable' | 'refused'

export function failureOf(error: unknown): PollFailure {
  return error instanceof ApiError && !error.retryable ? 'refused' : 'unreachable'
}

export interface PollerDeps {
  fetchDigest: () => Promise<Digest>
  onDigest: (digest: Digest, receivedAt: Date) => void
  onFailure: (failure: PollFailure) => void
  /** True while the page is visible and the browser is online. */
  isActive: () => boolean
  now?: () => Date
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

/**
 * Reads the digest on a timer, but only while the volunteer can see the app and has a connection.
 * Going hidden or offline stops the timer. Coming back reads once straight away. After a failure the wait
 * grows (see nextDelay) and goes back to 5 s after one success.
 */
export class DigestPoller {
  private timer: unknown = null
  private failures = 0
  private inFlight = false
  private running = false
  private readonly now: () => Date
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void

  constructor(private readonly deps: PollerDeps) {
    this.now = deps.now ?? (() => new Date())
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  }

  start(): void {
    this.running = true
    this.failures = 0
    if (this.deps.isActive()) void this.read()
  }

  stop(): void {
    this.running = false
    this.cancel()
  }

  /** Read now, whatever the timer says. Used by Try again and by a notification tap. */
  refresh(): Promise<void> {
    if (!this.running) return Promise.resolve()
    this.cancel()
    return this.read()
  }

  /** The page was shown, hidden, or the connection changed. */
  activityChanged(): void {
    if (!this.running) return
    if (this.deps.isActive()) {
      this.failures = 0
      void this.refresh()
    } else {
      this.cancel()
    }
  }

  private cancel(): void {
    if (this.timer !== null) this.clearTimer(this.timer)
    this.timer = null
  }

  private schedule(ms: number): void {
    this.cancel()
    if (!this.running) return
    this.timer = this.setTimer(() => {
      this.timer = null
      if (this.deps.isActive()) void this.read()
    }, ms)
  }

  private async read(): Promise<void> {
    if (this.inFlight || !this.running) return
    this.inFlight = true
    try {
      const digest = await this.deps.fetchDigest()
      if (!this.running) return
      this.failures = 0
      this.deps.onDigest(digest, this.now())
    } catch (error) {
      if (!this.running) return
      this.failures += 1
      this.deps.onFailure(failureOf(error))
    } finally {
      this.inFlight = false
    }
    if (this.running && this.deps.isActive()) this.schedule(nextDelay(this.failures))
  }
}

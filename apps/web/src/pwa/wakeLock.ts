/** The part of the Screen Wake Lock API this app uses. */
export interface WakeLockSentinelLike {
  release(): Promise<void>
  addEventListener(type: 'release', listener: () => void): void
}

export interface WakeLockApi {
  request(type: 'screen'): Promise<WakeLockSentinelLike>
}

/**
 * Holds the phone screen awake while it is wanted (the WITHDRAW screen is showing).
 * The browser drops a wake lock whenever the page is hidden, so `visibilityChanged` asks again on return.
 * A browser without the API, or one that refuses, is left alone: nothing is shown and nothing is retried in a loop.
 */
export class WakeLockHolder {
  private wanted = false
  private sentinel: WakeLockSentinelLike | null = null
  private requesting = false

  constructor(
    private readonly api: () => WakeLockApi | undefined,
    private readonly isVisible: () => boolean,
  ) {}

  get held(): boolean {
    return this.sentinel !== null
  }

  setWanted(wanted: boolean): void {
    this.wanted = wanted
    if (wanted) void this.acquire()
    else void this.drop()
  }

  visibilityChanged(): void {
    if (this.wanted) void this.acquire()
  }

  dispose(): void {
    this.setWanted(false)
  }

  private async acquire(): Promise<void> {
    const api = this.api()
    if (!api || this.sentinel || this.requesting || !this.isVisible()) return
    this.requesting = true
    try {
      const lock = await api.request('screen')
      lock.addEventListener('release', () => {
        if (this.sentinel === lock) this.sentinel = null
      })
      if (this.wanted) {
        this.sentinel = lock
      } else {
        // The need ended while the browser was answering.
        await lock.release().catch(() => undefined)
      }
    } catch {
      // Refused (low battery, power saver, policy). The screen simply keeps its normal timeout.
    } finally {
      this.requesting = false
    }
  }

  private async drop(): Promise<void> {
    const lock = this.sentinel
    this.sentinel = null
    if (lock) await lock.release().catch(() => undefined)
  }
}

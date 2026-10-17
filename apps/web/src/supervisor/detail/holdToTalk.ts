/**
 * Press-and-hold behaviour for a talk button. `down` starts once, `up` stops once, and an extra `down` (key repeat,
 * a second pointer) or an `up` with nothing held does nothing. It carries no audio: the caller supplies `start` and
 * `stop`, which must be the real channel to the volunteer.
 */
export interface HoldToTalk {
  down(): void
  up(): void
  held(): boolean
}

export function createHoldToTalk(start: () => void, stop: () => void): HoldToTalk {
  let held = false
  return {
    down() {
      if (held) return
      held = true
      start()
    },
    up() {
      if (!held) return
      held = false
      stop()
    },
    held: () => held,
  }
}

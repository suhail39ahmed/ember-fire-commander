import { describe, expect, it } from 'vitest'

import { ApiError } from '../api/types'
import type { Digest } from '../contracts/types'
import { DigestPoller, failureOf, MAX_BACKOFF_MS, nextDelay, POLL_MS, type PollFailure } from '../digestPoll'

const DIGEST: Digest = { updatedAt: '2026-10-16T08:00:00.000Z', incidents: [], myTasks: [] }

/** A poller wired to a manual clock, so every wait can be inspected and fired by hand. */
function setup(results: Array<Digest | Error>) {
  const state = { active: true, calls: 0, timers: [] as Array<{ fn: () => void; ms: number; live: boolean }> }
  const seen: Array<{ digest: Digest; at: Date }> = []
  const failures: PollFailure[] = []
  const poller = new DigestPoller({
    fetchDigest: async () => {
      const next = results[Math.min(state.calls, results.length - 1)]
      state.calls += 1
      if (next instanceof Error) throw next
      return next
    },
    onDigest: (digest, at) => seen.push({ digest, at }),
    onFailure: (f) => failures.push(f),
    isActive: () => state.active,
    now: () => new Date('2026-10-16T08:00:01.000Z'),
    setTimer: (fn, ms) => {
      const timer = { fn, ms, live: true }
      state.timers.push(timer)
      return timer
    },
    clearTimer: (handle) => {
      const timer = handle as { live: boolean }
      timer.live = false
    },
  })
  const live = () => state.timers.filter((t) => t.live)
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  const fire = async () => {
    const timer = live()[0]
    timer.live = false
    timer.fn()
    await settle()
  }
  return { poller, state, seen, failures, live, settle, fire }
}

const unreachable = () => new ApiError('network', 'Network error', null, true)
const refused = () => new ApiError('unauthorized', 'Not signed in', 401, false)

describe('nextDelay', () => {
  it('waits 5 s, then 10 s, 20 s and never more than 30 s', () => {
    expect([0, 1, 2, 3, 4, 10].map(nextDelay)).toEqual([POLL_MS, 10000, 20000, MAX_BACKOFF_MS, MAX_BACKOFF_MS, MAX_BACKOFF_MS])
  })
})

describe('failureOf', () => {
  it('calls a refusal retrying cannot fix "refused" and everything else "unreachable"', () => {
    expect(failureOf(refused())).toBe('refused')
    expect(failureOf(new ApiError('forbidden', 'no', 403, false))).toBe('refused')
    expect(failureOf(unreachable())).toBe('unreachable')
    expect(failureOf(new ApiError('unavailable', 'HTTP 503', 503, true))).toBe('unreachable')
    expect(failureOf(new Error('boom'))).toBe('unreachable')
  })
})

describe('DigestPoller', () => {
  it('reads at once, then again every 5 s while the app is active', async () => {
    const t = setup([DIGEST])
    t.poller.start()
    await t.settle()
    expect(t.state.calls).toBe(1)
    expect(t.seen[0].digest).toBe(DIGEST)
    expect(t.seen[0].at.toISOString()).toBe('2026-10-16T08:00:01.000Z')
    expect(t.live().map((x) => x.ms)).toEqual([POLL_MS])
    await t.fire()
    expect(t.state.calls).toBe(2)
  })

  it('does not read, and sets no timer, while the page is hidden or offline', async () => {
    const t = setup([DIGEST])
    t.state.active = false
    t.poller.start()
    await t.settle()
    expect(t.state.calls).toBe(0)
    expect(t.live()).toHaveLength(0)
  })

  it('stops the timer when the page is hidden and reads once when it comes back', async () => {
    const t = setup([DIGEST])
    t.poller.start()
    await t.settle()
    t.state.active = false
    t.poller.activityChanged()
    expect(t.live()).toHaveLength(0)
    t.state.active = true
    t.poller.activityChanged()
    await t.settle()
    expect(t.state.calls).toBe(2)
    expect(t.live().map((x) => x.ms)).toEqual([POLL_MS])
  })

  it('backs off after failures and goes back to 5 s after one success', async () => {
    const t = setup([unreachable(), unreachable(), unreachable(), unreachable(), DIGEST])
    t.poller.start()
    await t.settle()
    expect(t.live().map((x) => x.ms)).toEqual([10000])
    await t.fire()
    expect(t.live().map((x) => x.ms)).toEqual([20000])
    await t.fire()
    expect(t.live().map((x) => x.ms)).toEqual([30000])
    await t.fire()
    expect(t.live().map((x) => x.ms)).toEqual([30000])
    await t.fire()
    expect(t.live().map((x) => x.ms)).toEqual([POLL_MS])
    expect(t.failures).toEqual(['unreachable', 'unreachable', 'unreachable', 'unreachable'])
  })

  it('reports a 401 as refused instead of staying silent, and keeps trying slowly', async () => {
    const t = setup([refused()])
    t.poller.start()
    await t.settle()
    expect(t.failures).toEqual(['refused'])
    expect(t.live().map((x) => x.ms)).toEqual([10000])
  })

  it('refresh reads straight away and restarts the wait', async () => {
    const t = setup([DIGEST])
    t.poller.start()
    await t.settle()
    await t.poller.refresh()
    expect(t.state.calls).toBe(2)
    expect(t.live()).toHaveLength(1)
  })

  it('does not start a second read while one is in flight', async () => {
    const t = setup([DIGEST])
    t.poller.start()
    void t.poller.refresh()
    void t.poller.refresh()
    await t.settle()
    expect(t.state.calls).toBe(1)
  })

  it('ignores a late answer after stop', async () => {
    const t = setup([DIGEST])
    t.poller.start()
    t.poller.stop()
    await t.settle()
    expect(t.seen).toHaveLength(0)
    expect(t.live()).toHaveLength(0)
    await t.poller.refresh()
    expect(t.state.calls).toBe(1)
  })
})

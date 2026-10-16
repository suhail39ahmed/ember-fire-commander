import { describe, expect, it } from 'vitest'

import {
  clockMessage,
  currentSkew,
  isClockRejection,
  MAX_SKEW_AGE_MS,
  measureSkew,
  recordDigestClock,
  recordSkew,
  SKEW_KEY,
  stampNow,
} from '../clock'

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data }
}

const NOW = new Date('2026-10-16T08:00:00.000Z')

describe('measureSkew', () => {
  it('is server time minus phone time', () => {
    expect(measureSkew('2026-10-16T08:10:00Z', NOW)).toBe(10 * 60_000)
    expect(measureSkew('2026-10-16T07:50:00Z', NOW)).toBe(-10 * 60_000)
  })

  it('is null for a server time that is not a timestamp', () => {
    expect(measureSkew('soon', NOW)).toBeNull()
  })
})

describe('stampNow', () => {
  it('moves a phone that runs fast back to server time', () => {
    const store = memory()
    const phone = new Date('2026-10-16T08:10:00.000Z')
    // The digest said the server was at 08:00:00 when the phone read 08:10:00.
    recordDigestClock({ updatedAt: '2026-10-16T08:00:00.000Z' }, phone, store)
    expect(stampNow(new Date('2026-10-16T08:12:00.000Z'), store)).toBe('2026-10-16T08:02:00.000Z')
  })

  it('moves a phone that runs slow forward', () => {
    const store = memory()
    recordDigestClock({ updatedAt: '2026-10-16T08:30:00.000Z' }, NOW, store)
    expect(stampNow(new Date('2026-10-16T08:01:00.000Z'), store)).toBe('2026-10-16T08:31:00.000Z')
  })

  it('leaves the phone time alone for a gap under a minute', () => {
    const store = memory()
    recordDigestClock({ updatedAt: '2026-10-16T08:00:59.000Z' }, NOW, store)
    expect(stampNow(NOW, store)).toBe(NOW.toISOString())
  })

  it('uses the phone time when nothing is stored', () => {
    expect(stampNow(NOW, memory())).toBe(NOW.toISOString())
    expect(stampNow(NOW, null)).toBe(NOW.toISOString())
  })

  it('ignores a gap measured more than 7 days ago', () => {
    const store = memory()
    recordSkew(600_000, NOW, store)
    const later = new Date(NOW.getTime() + MAX_SKEW_AGE_MS + 1)
    expect(currentSkew(later, store)).toBe(0)
    expect(currentSkew(new Date(NOW.getTime() + MAX_SKEW_AGE_MS - 1), store)).toBe(600_000)
  })

  it('lets the latest reading replace an old gap once the clock is fixed', () => {
    const store = memory()
    recordSkew(600_000, NOW, store)
    recordSkew(1_000, new Date(NOW.getTime() + 1000), store)
    expect(currentSkew(NOW, store)).toBe(0)
  })

  it('ignores stored values that are damaged', () => {
    expect(currentSkew(NOW, memory({ [SKEW_KEY]: 'not json' }))).toBe(0)
    expect(currentSkew(NOW, memory({ [SKEW_KEY]: JSON.stringify({ skewMs: 'x', at: NOW.toISOString() }) }))).toBe(0)
    expect(currentSkew(NOW, memory({ [SKEW_KEY]: JSON.stringify({ skewMs: 600000, at: 'never' }) }))).toBe(0)
  })

  it('does not throw when storage refuses to write', () => {
    const store = { getItem: () => null, setItem: () => { throw new Error('quota') } }
    expect(() => recordSkew(600_000, NOW, store)).not.toThrow()
  })
})

describe('clock rejection', () => {
  it('recognises a capturedAt field error and nothing else', () => {
    expect(isClockRejection({ capturedAt: 'capturedAt must not be more than 5 minutes in the future' })).toBe(true)
    expect(isClockRejection({ lat: 'lat must be a number' })).toBe(false)
    expect(isClockRejection(undefined)).toBe(false)
  })

  it('explains the problem in both languages', () => {
    expect(clockMessage('id')).toContain('Jam ponsel')
    expect(clockMessage('en')).toContain('clock looks wrong')
  })
})

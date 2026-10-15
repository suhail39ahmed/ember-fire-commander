import { describe, expect, it } from 'vitest'

import { formatTime } from '../formatTime'

describe('formatTime', () => {
  it('writes HH:mm on a 24-hour clock with a colon', () => {
    expect(formatTime(new Date(2026, 9, 17, 14, 12))).toBe('14:12')
    expect(formatTime(new Date(2026, 9, 17, 9, 5))).toBe('09:05')
    expect(formatTime(new Date(2026, 9, 17, 0, 0))).toBe('00:00')
    expect(formatTime(new Date(2026, 9, 17, 23, 59))).toBe('23:59')
  })

  it('accepts an ISO string or a timestamp and reads it in the phone time zone', () => {
    const d = new Date(2026, 9, 17, 14, 12, 30)
    expect(formatTime(d.toISOString())).toBe('14:12')
    expect(formatTime(d.getTime())).toBe('14:12')
  })

  it('does not throw on a bad value', () => {
    expect(formatTime('not a time')).toBe('--:--')
  })
})

import { describe, expect, it } from 'vitest'

import { formatDateTime, formatDay, formatTime, formatTimeZone } from '../formatTime'

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

describe('formatTimeZone', () => {
  it('writes the local time and names the zone', () => {
    const at = new Date(2026, 9, 16, 17, 7)
    expect(formatTimeZone(at)).toMatch(/^17:07 \S+/)
    expect(formatTimeZone(at.toISOString())).toBe(formatTimeZone(at))
  })

  it('shows a placeholder for an unreadable time', () => {
    expect(formatTimeZone('not a time')).toBe('--:--')
  })
})

describe('formatDateTime and formatDay', () => {
  it('adds the calendar day to the time and zone', () => {
    const at = new Date(2026, 9, 16, 9, 5)
    expect(formatDay(at)).toBe('16 Oct 2026')
    expect(formatDateTime(at)).toMatch(/^16 Oct 2026, 09:05 \S+/)
  })

  it('copes with a bad value', () => {
    expect(formatDateTime('x')).toBe('--:--')
    expect(formatDay('x')).toBe('')
  })
})

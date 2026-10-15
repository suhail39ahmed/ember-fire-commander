import { describe, expect, it } from 'vitest'

import { strings } from '../i18n'
import { statusLine, type ReportStatus } from '../report/status'

describe('statusLine', () => {
  it('is neutral, never an error, while the location is pending', () => {
    for (const lang of ['id', 'en'] as const) {
      expect(statusLine({ kind: 'locating' }, lang)).toEqual({ tone: 'busy', text: strings.locating[lang] })
    }
  })

  it('shows red only for a real failure', () => {
    const tones = (s: ReportStatus) => statusLine(s, 'en').tone
    expect(tones({ kind: 'idle' })).toBe('muted')
    expect(tones({ kind: 'sending' })).toBe('muted')
    expect(tones({ kind: 'locating' })).not.toBe('error')
    expect(tones({ kind: 'error', message: 'x', retryable: false, location: 'denied' })).toBe('error')
  })

  it('shows the failure message in the current language', () => {
    const status: ReportStatus = { kind: 'error', message: 'Location is blocked.', retryable: false, location: 'denied' }
    expect(statusLine(status, 'en').text).toBe('Location is blocked.')
  })

  it('tells the volunteer their location is attached when nothing is wrong', () => {
    expect(statusLine({ kind: 'idle' }, 'id').text).toBe(strings.locationNote.id)
  })
})

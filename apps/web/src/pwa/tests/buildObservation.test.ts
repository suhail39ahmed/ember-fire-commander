import { describe, expect, it } from 'vitest'
import { CHIP_VALUES } from '../contracts/types'
import { buildObservation, validateDraft } from '../report/buildObservation'

const pos = { lat: -1.8492, lng: 110.0508, accuracyM: 12 }
const capturedAt = '2026-10-17T03:02:00Z'

describe('buildObservation', () => {
  it.each(CHIP_VALUES)('chip %s gives the POST /observations body', (chip) => {
    expect(buildObservation({ chip, text: '', capturedAt }, pos)).toEqual({
      source: 'chip',
      capturedAt,
      lat: pos.lat,
      lng: pos.lng,
      accuracyM: 12,
      chip,
      text: null,
    })
  })

  it('a note without a chip is a text report with no chip', () => {
    const o = buildObservation({ chip: null, text: '  Asap tipis di tepi kanal ', capturedAt }, pos)
    expect(o.source).toBe('text')
    expect(o.chip).toBeNull()
    expect(o.text).toBe('Asap tipis di tepi kanal')
    expect(o.capturedAt).toBe(capturedAt)
  })

  it('never sends server-owned fields', () => {
    const o = buildObservation({ chip: 'api', text: 'api besar', capturedAt }, pos) as unknown as Record<string, unknown>
    for (const key of ['id', 'volunteerId', 'receivedAt', 'severity', 'photoPath', 'immutable']) {
      expect(key in o).toBe(false)
    }
  })

  it('validation: empty is rejected, note-only is allowed', () => {
    expect(validateDraft({ chip: null, text: '  ', capturedAt })).toBe('empty')
    expect(validateDraft({ chip: null, text: 'ada asap', capturedAt })).toBeNull()
    expect(validateDraft({ chip: 'aman', text: '', capturedAt })).toBeNull()
    expect(validateDraft({ chip: null, text: 'x'.repeat(281), capturedAt })).toBe('too_long')
  })
})

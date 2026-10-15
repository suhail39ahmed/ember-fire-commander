import { describe, expect, it } from 'vitest'
import { incidentLabel, incidentLabelById, shortIncidentId } from '../incidentName'

describe('incidentLabel', () => {
  it('uses the name agents wrote', () => {
    expect(incidentLabel({ id: '4kQ9xZ7hLm', name: 'Bengkalis, Riau · Sari · #3' })).toBe('Bengkalis, Riau · Sari · #3')
  })

  it('trims the name', () => {
    expect(incidentLabel({ id: 'abc', name: '  Ketapang · #1  ' })).toBe('Ketapang · #1')
  })

  it('falls back to a short id when there is no name', () => {
    expect(incidentLabel({ id: '4kQ9xZ7hLm' })).toBe('INC-7HLM')
    expect(incidentLabel({ id: '4kQ9xZ7hLm', name: null })).toBe('INC-7HLM')
    expect(incidentLabel({ id: '4kQ9xZ7hLm', name: '   ' })).toBe('INC-7HLM')
  })
})

describe('shortIncidentId', () => {
  it('keeps the last four characters, upper case', () => {
    expect(shortIncidentId('4kQ9xZ7hLm')).toBe('INC-7HLM')
  })

  it('copes with ids shorter than four characters', () => {
    expect(shortIncidentId('ab')).toBe('INC-AB')
  })
})

describe('incidentLabelById', () => {
  const incidents = [
    { id: 'inc_a', name: 'Dumai, Riau · Dedi · #2' },
    { id: 'inc_b', name: null },
  ]

  it('finds the name for a task incident id', () => {
    expect(incidentLabelById('inc_a', incidents)).toBe('Dumai, Riau · Dedi · #2')
  })

  it('uses the short id when the incident is unnamed or not in the digest', () => {
    expect(incidentLabelById('inc_b', incidents)).toBe('INC-NC_B')
    expect(incidentLabelById('inc_zzzz9', incidents)).toBe('INC-ZZZ9')
    expect(incidentLabelById('inc_zzzz9', null)).toBe('INC-ZZZ9')
    expect(incidentLabelById('inc_zzzz9', undefined)).toBe('INC-ZZZ9')
  })
})

import { describe, expect, it } from 'vitest'
import { coordinateLabel, incidentLabel, incidentLabelById } from '../incidentName'

describe('incidentLabel', () => {
  it('uses the name agents wrote', () => {
    expect(incidentLabel({ id: '4kQ9xZ7hLm', name: 'Bengkalis, Riau · Sari · #3' })).toBe('Bengkalis, Riau · Sari · #3')
  })

  it('trims the name', () => {
    expect(incidentLabel({ id: 'abc', name: '  Ketapang · #1  ' })).toBe('Ketapang · #1')
  })

  it('falls back to the area, then the position, then a plain word, and never to the id', () => {
    expect(incidentLabel({ id: '4kQ9xZ7hLm', name: null, area: 'Dumai, Riau' })).toBe('Incident · Dumai, Riau')
    expect(incidentLabel({ id: '4kQ9xZ7hLm', name: '   ', area: '  ', lat: 18.5312, lng: 73.8801 })).toBe('Incident · 18.53°N 73.88°E')
    expect(incidentLabel({ id: '4kQ9xZ7hLm' })).toBe('Incident')
    expect(incidentLabel({ id: '4kQ9xZ7hLm', lat: Number.NaN, lng: 1 })).toBe('Incident')
    for (const incident of [{ id: '4kQ9xZ7hLm' }, { id: '4kQ9xZ7hLm', lat: 1, lng: 2 }]) {
      expect(incidentLabel(incident)).not.toMatch(/4kQ9|7HLM|INC-/i)
    }
  })

  it('speaks Bahasa when asked', () => {
    expect(incidentLabel({ id: 'a', lat: -1.5, lng: 110.25 }, 'id')).toBe('Insiden · 1.50°S 110.25°E')
    expect(incidentLabel({ id: 'a' }, 'id')).toBe('Insiden')
  })
})

describe('coordinateLabel', () => {
  it('names the hemispheres and rounds to two decimals', () => {
    expect(coordinateLabel(13.05, 77.63)).toBe('13.05°N 77.63°E')
    expect(coordinateLabel(-0.004, -70.256)).toBe('0.00°S 70.26°W')
    expect(coordinateLabel(null, 1)).toBeNull()
    expect(coordinateLabel(undefined, undefined)).toBeNull()
  })
})

describe('incidentLabelById', () => {
  const incidents = [
    { id: 'inc_a', name: 'Dumai, Riau · Dedi · #2' },
    { id: 'inc_b', name: null, area: 'Pekanbaru, Riau' },
  ]

  it('finds the name for a task incident id', () => {
    expect(incidentLabelById('inc_a', incidents)).toBe('Dumai, Riau · Dedi · #2')
    expect(incidentLabelById('inc_b', incidents)).toBe('Incident · Pekanbaru, Riau')
  })

  it('uses a plain word, never the id, when the incident is not in the list', () => {
    expect(incidentLabelById('inc_zzzz9', incidents)).toBe('Incident')
    expect(incidentLabelById('inc_zzzz9', null)).toBe('Incident')
    expect(incidentLabelById('inc_zzzz9', undefined, 'id')).toBe('Insiden')
  })
})

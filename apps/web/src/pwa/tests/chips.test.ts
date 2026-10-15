import { describe, expect, it } from 'vitest'

import { CHIP_VALUES } from '../contracts/types'
import { chipLabel, chipText } from '../report/chips'

describe('chipLabel', () => {
  it('uses the Bahasa word alone in Bahasa mode', () => {
    expect(CHIP_VALUES.map((c) => chipLabel(c, 'id'))).toEqual([
      { primary: 'asap', secondary: null },
      { primary: 'api', secondary: null },
      { primary: 'aman', secondary: null },
      { primary: 'butuh bantuan', secondary: null },
    ])
  })

  it('uses English with the Bahasa word as the second line in English mode', () => {
    expect(CHIP_VALUES.map((c) => chipLabel(c, 'en'))).toEqual([
      { primary: 'Smoke', secondary: 'asap' },
      { primary: 'Fire', secondary: 'api' },
      { primary: 'Safe', secondary: 'aman' },
      { primary: 'Need help', secondary: 'butuh bantuan' },
    ])
  })
})

describe('chipText', () => {
  it('gives a one-line label', () => {
    expect(chipText('api', 'id')).toBe('api')
    expect(chipText('api', 'en')).toBe('Fire (api)')
    expect(chipText('butuh_bantuan', 'en')).toBe('Need help (butuh bantuan)')
  })
})

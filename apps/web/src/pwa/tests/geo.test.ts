import { describe, expect, it } from 'vitest'

import { bearingDeg, compassOf, distanceM, formatDistance, projectPoints } from '../screens/geo'

const a = { lat: 0, lng: 0 }

describe('geo', () => {
  it('measures about 111 km for one degree of latitude', () => {
    expect(distanceM(a, { lat: 1, lng: 0 })).toBeGreaterThan(111_000)
    expect(distanceM(a, { lat: 1, lng: 0 })).toBeLessThan(111_400)
    expect(distanceM(a, a)).toBe(0)
  })

  it('gives bearings for the four directions', () => {
    expect(Math.round(bearingDeg(a, { lat: 1, lng: 0 }))).toBe(0)
    expect(Math.round(bearingDeg(a, { lat: 0, lng: 1 }))).toBe(90)
    expect(Math.round(bearingDeg(a, { lat: -1, lng: 0 }))).toBe(180)
    expect(Math.round(bearingDeg(a, { lat: 0, lng: -1 }))).toBe(270)
  })

  it('names the eight compass points and wraps at 360', () => {
    expect(compassOf(0)).toBe('N')
    expect(compassOf(44)).toBe('NE')
    expect(compassOf(225)).toBe('SW')
    expect(compassOf(359)).toBe('N')
    expect(compassOf(-45)).toBe('NW')
  })

  it('formats metres and kilometres', () => {
    expect(formatDistance(380.4)).toEqual({ value: '380', unit: 'm' })
    expect(formatDistance(1530)).toEqual({ value: '1.5', unit: 'km' })
    expect(formatDistance(-3)).toEqual({ value: '0', unit: 'm' })
  })

  it('projects with north up and keeps every point inside the square', () => {
    const [south, north] = projectPoints([
      { id: 's', lat: -0.001, lng: 0 },
      { id: 'n', lat: 0.001, lng: 0 },
    ])
    expect(north.y).toBeLessThan(south.y)
    for (const p of [south, north]) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(100)
    }
  })

  it('puts a single point, or points on one spot, in the middle', () => {
    expect(projectPoints([{ id: 'x', lat: 5, lng: 5 }])).toEqual([{ id: 'x', x: 50, y: 50 }])
    expect(projectPoints([])).toEqual([])
  })
})

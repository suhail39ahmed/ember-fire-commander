/** Small map maths for the volunteer screens. Everything here is computed from real coordinates, never made up. */
export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_M = 6_371_000
const rad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial bearing from a to b in degrees, 0 = north, clockwise. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
export type Compass = (typeof COMPASS)[number]

export function compassOf(deg: number): Compass {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

/** The compass letters in the volunteer's language: Indonesian uses U, T, S and B for the four main directions. */
const COMPASS_ID: Record<Compass, string> = { N: 'U', NE: 'TL', E: 'T', SE: 'TG', S: 'S', SW: 'BD', W: 'B', NW: 'BL' }
export const compassLabel = (compass: Compass, lang: 'id' | 'en'): string => (lang === 'id' ? COMPASS_ID[compass] : compass)

/** Metres under 1 km, kilometres with one decimal above. */
export function formatDistance(m: number): { value: string; unit: 'm' | 'km' } {
  if (m < 1000) return { value: String(Math.max(0, Math.round(m))), unit: 'm' }
  return { value: (m / 1000).toFixed(1), unit: 'km' }
}

export interface MapPoint extends LatLng {
  id: string
}

export interface Projected {
  id: string
  /** 0 to 100, left to right. */
  x: number
  /** 0 to 100, top to bottom (north is up). */
  y: number
}

/**
 * Places points on a flat 0-100 square, north up, scaled so the farthest point fits with a margin.
 * Uses an equirectangular projection around the points' centre, which is accurate over the few
 * kilometres a volunteer map covers. With one point, or points on one spot, they sit in the middle.
 */
export function projectPoints(points: MapPoint[], margin = 14): Projected[] {
  if (points.length === 0) return []
  const lat0 = points.reduce((sum, p) => sum + p.lat, 0) / points.length
  const lng0 = points.reduce((sum, p) => sum + p.lng, 0) / points.length
  const metres = points.map((p) => ({
    id: p.id,
    east: rad(p.lng - lng0) * Math.cos(rad(lat0)) * EARTH_RADIUS_M,
    north: rad(p.lat - lat0) * EARTH_RADIUS_M,
  }))
  const reach = Math.max(...metres.map((m) => Math.max(Math.abs(m.east), Math.abs(m.north))))
  const half = 50 - margin
  const scale = reach > 0 ? half / reach : 0
  return metres.map((m) => ({ id: m.id, x: 50 + m.east * scale, y: 50 - m.north * scale }))
}

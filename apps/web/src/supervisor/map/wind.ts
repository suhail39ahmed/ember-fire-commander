import type { Lang } from '../../pwa/i18n'

/** What ember-api reports from the stored weather. `fromDeg` is the direction the wind blows FROM, in degrees from north. */
export interface WindReading {
  kmh: number
  fromDeg: number
}

const POINTS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
const POINTS_ID = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'] as const

/** Both numbers must exist and be real, or there is no reading. Nothing is filled in. */
export function windReading(kmh: number | null | undefined, fromDeg: number | null | undefined): WindReading | null {
  if (typeof kmh !== 'number' || typeof fromDeg !== 'number') return null
  if (!Number.isFinite(kmh) || !Number.isFinite(fromDeg) || kmh < 0) return null
  return { kmh, fromDeg: ((fromDeg % 360) + 360) % 360 }
}

/** Compass point of a bearing: 0 is N, 225 is SW. */
export function compass(deg: number, lang: Lang = 'en'): string {
  const names = lang === 'id' ? POINTS_ID : POINTS_EN
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

/** The arrow points where the wind is going, which is opposite to where it comes from. Rotation of an up arrow, in degrees. */
export function arrowDeg(fromDeg: number): number {
  return (fromDeg + 180) % 360
}

/** "Wind 14 km/h from SW (225°)". */
export function windText(wind: WindReading, lang: Lang): string {
  const speed = Math.round(wind.kmh * 10) / 10
  const word = lang === 'id' ? 'Angin' : 'Wind'
  const from = lang === 'id' ? 'dari' : 'from'
  return `${word} ${speed} km/h ${from} ${compass(wind.fromDeg, lang)} (${Math.round(wind.fromDeg)}°)`
}

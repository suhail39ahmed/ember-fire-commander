import { formatTime } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import type { AirCondition, WeatherCondition } from '../contracts'
import { conditionsCopy } from './conditionsCopy'

function num(value: number): string {
  return String(Math.round(value * 10) / 10)
}

/** "12.4 km/h from SW", or null when the stored read has no wind speed. */
export function windValue(lang: Lang, weather: WeatherCondition): string | null {
  if (weather.windKmh === null) return null
  const from = weather.windFrom ? ` ${t(lang, conditionsCopy.windFrom)} ${weather.windFrom}` : ''
  return `${num(weather.windKmh)} km/h${from}`
}

/** The stored extras of the weather read, in the order a reader scans them. Missing parts are left out. */
export function weatherNote(lang: Lang, weather: WeatherCondition): string {
  const parts: string[] = []
  if (weather.gustKmh !== null) parts.push(`${t(lang, conditionsCopy.gust)} ${num(weather.gustKmh)} km/h`)
  if (weather.tempC !== null) parts.push(`${num(weather.tempC)} °C`)
  if (weather.humidityPct !== null) parts.push(`${t(lang, conditionsCopy.humidity)} ${num(weather.humidityPct)}%`)
  if (weather.rainMm !== null) parts.push(`${t(lang, conditionsCopy.rain)} ${num(weather.rainMm)} mm`)
  if (weather.observedAt) parts.push(`${t(lang, conditionsCopy.at)} ${formatTime(weather.observedAt)}`)
  return parts.join(' · ')
}

/** "PSI 24 h 88", or null when the stored read has no PSI. */
export function airValue(lang: Lang, air: AirCondition): string | null {
  if (air.psi24hMax === null) return null
  return `${t(lang, conditionsCopy.psi)} ${num(air.psi24hMax)}`
}

export function airNote(lang: Lang, air: AirCondition): string {
  const parts: string[] = []
  if (air.pm25Max !== null) parts.push(`${t(lang, conditionsCopy.pm25)} ${num(air.pm25Max)}`)
  if (air.observedAt) parts.push(`${t(lang, conditionsCopy.at)} ${formatTime(air.observedAt)}`)
  return parts.join(' · ')
}

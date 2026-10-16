/**
 * How each incident is drawn. Only fields from ember-api decide this:
 * severity, status, conflictId and withdraw. Nothing here estimates spread.
 */
import type { Incident, VolunteerCardData } from '../contracts'
import { incidentLabel } from '../../pwa/incidentName'
import { SEVERITY_LABEL, STATUS_LABEL } from '../view'

/** Fixed display ring around a withdrawn incident. Indicative, not a hazard model. */
export const WITHDRAW_ZONE_M = 500

export const PIN_COLOR = {
  large_flame: '#C81E1E',
  small_flame: '#E2531B',
  smoke: '#B7791F',
  none: '#2F7D4F',
  unknown: '#6B645C',
} as const

export interface PinStyle {
  color: string
  /** Held incident with a conflict: amber "Same fire?" ring. */
  conflict: boolean
  withdraw: boolean
  /** Verified incidents get a solid outline; open and held are hollow-ringed. */
  verified: boolean
  label: string
  badge: string | null
}

export function pinStyle(incident: Incident): PinStyle {
  const withdraw = Boolean(incident.withdraw?.active)
  const conflict = incident.status === 'held' || incident.conflictId !== null
  return {
    color: PIN_COLOR[incident.severity],
    conflict,
    withdraw,
    verified: incident.status === 'verified',
    label: `${incidentLabel(incident)} · ${STATUS_LABEL[incident.status]} · ${SEVERITY_LABEL[incident.severity]}`,
    badge: withdraw ? 'Withdrawn' : conflict ? 'Same fire?' : null,
  }
}

/** Incidents with usable coordinates. Bad values are skipped, not guessed. */
export function placeable(incidents: Incident[]): Incident[] {
  return incidents.filter(
    (i) => Number.isFinite(i.lat) && Number.isFinite(i.lng) && Math.abs(i.lat) <= 90 && Math.abs(i.lng) <= 180,
  )
}

export interface Point {
  id: string
  x: number
  y: number
}

/**
 * Positions for the schematic view used when no map key is set.
 * Keeps relative positions (north up) inside a padded box.
 */
export function project(incidents: Incident[], width: number, height: number, pad = 48): Point[] {
  const list = placeable(incidents)
  if (list.length === 0) return []
  const lats = list.map((i) => i.lat)
  const lngs = list.map((i) => i.lng)
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)]
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)]
  const spanLat = maxLat - minLat || 1
  const spanLng = maxLng - minLng || 1
  return list.map((i) => ({
    id: i.id,
    x: list.length === 1 ? width / 2 : pad + ((i.lng - minLng) / spanLng) * (width - 2 * pad),
    y: list.length === 1 ? height / 2 : pad + ((maxLat - i.lat) / spanLat) * (height - 2 * pad),
  }))
}

/** One crew member's last reported position, from their card on the open incident. */
export interface CrewDot {
  id: string
  name: string | null
  lat: number
  lng: number
}

/** Cards with a usable last position. A card without one is left out, not placed. */
export function crewDots(cards: VolunteerCardData[] | null | undefined): CrewDot[] {
  return (cards ?? [])
    .filter((c) => c.lastLat !== null && c.lastLng !== null && Number.isFinite(c.lastLat) && Number.isFinite(c.lastLng) && Math.abs(c.lastLat) <= 90 && Math.abs(c.lastLng) <= 180)
    .map((c) => ({ id: c.volunteerId, name: c.name?.trim() || null, lat: c.lastLat as number, lng: c.lastLng as number }))
}

/** Like `project`, with crew dots placed in the same box so incidents and crews stay in true relation. */
export function projectWithCrews(incidents: Incident[], crews: CrewDot[], width: number, height: number, pad = 48): { incidents: Point[]; crews: Point[] } {
  const list = placeable(incidents)
  const all = [...list.map((i) => ({ lat: i.lat, lng: i.lng })), ...crews.map((c) => ({ lat: c.lat, lng: c.lng }))]
  if (all.length === 0) return { incidents: [], crews: [] }
  const lats = all.map((p) => p.lat)
  const lngs = all.map((p) => p.lng)
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)]
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)]
  const spanLat = maxLat - minLat || 1
  const spanLng = maxLng - minLng || 1
  const at = (p: { lat: number; lng: number }) => ({
    x: all.length === 1 ? width / 2 : pad + ((p.lng - minLng) / spanLng) * (width - 2 * pad),
    y: all.length === 1 ? height / 2 : pad + ((maxLat - p.lat) / spanLat) * (height - 2 * pad),
  })
  return { incidents: list.map((i) => ({ id: i.id, ...at(i) })), crews: crews.map((c) => ({ id: c.id, ...at(c) })) }
}

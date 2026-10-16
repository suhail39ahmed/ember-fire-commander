/**
 * The one naming rule for an incident, used by every screen: the banner, the list, the detail,
 * the dialogs, the map and the volunteer app.
 *
 *   1. the stored `name` (agents write it once, such as "Bengkalis, Riau · Pak Dedi · #3")
 *   2. "Incident · <area>"
 *   3. "Incident · <coordinates>" from the stored position
 *   4. "Incident"
 *
 * A Firestore id is never part of a label, so an incident made before names existed reads as
 * "Incident · 18.53°N 73.88°E" and not "INC-T4L7".
 */
export interface Nameable {
  id: string
  name?: string | null
  area?: string | null
  lat?: number | null
  lng?: number | null
}

const WORD = { id: 'Insiden', en: 'Incident' } as const

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** "13.05°N 77.63°E", or null when either coordinate is missing. */
export function coordinateLabel(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (!finite(lat) || !finite(lng)) return null
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`
}

export function incidentLabel(incident: Nameable, lang: 'id' | 'en' = 'en'): string {
  const name = incident.name?.trim()
  if (name) return name
  const place = incident.area?.trim() || coordinateLabel(incident.lat, incident.lng)
  return place ? `${WORD[lang]} · ${place}` : WORD[lang]
}

/** Label for an incident known only by id, such as a task's `incidentId`. Never the id itself. */
export function incidentLabelById(id: string, incidents: Nameable[] | null | undefined, lang: 'id' | 'en' = 'en'): string {
  const found = incidents?.find((i) => i.id === id)
  return found ? incidentLabel(found, lang) : WORD[lang]
}

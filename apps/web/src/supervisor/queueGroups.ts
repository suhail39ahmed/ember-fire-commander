/**
 * The incident queue grouped by area (section 5.2 `area`). Display only: the
 * order and the groups come from fields ember-api returns, nothing is decided here.
 */
import { coordinateLabel, incidentLabel } from '../pwa/incidentName'
import type { Incident, Severity } from './contracts'

export const UNNAMED_AREA = 'Unnamed area'

const SEVERITY_RANK: Record<Severity, number> = { none: 0, unknown: 1, smoke: 2, small_flame: 3, large_flame: 4 }

export interface AreaGroup {
  area: string
  incidents: Incident[]
}

/** `area`, else the part of `name` before the first " · ", else the position as a label, else "Unnamed area". */
export function areaOf(incident: Incident): string {
  const area = incident.area?.trim()
  if (area) return area
  const fromName = incident.name?.split(' · ')[0].trim()
  return fromName || coordinateLabel(incident.lat, incident.lng) || UNNAMED_AREA
}

/** The incident number in a name such as "Bengkalis, Riau · Pak Dedi · #3". Higher is newer; -1 when unnamed. */
export function incidentNumber(incident: Incident): number {
  const match = incident.name?.trim().match(/#(\d+)$/)
  return match ? Number(match[1]) : -1
}

/** The name without its area prefix, for use under the area heading. */
export function labelInArea(incident: Incident, area: string): string {
  const label = incidentLabel(incident)
  const prefix = `${area} · `
  return label.startsWith(prefix) && label.length > prefix.length ? label.slice(prefix.length) : label
}

/**
 * Groups keep the order of `incidents` inside each group. Groups with an active
 * withdraw come first, then the highest severity, then the newest incident number,
 * then the area name so the order never flickers between polls.
 */
export function groupByArea(incidents: Incident[]): AreaGroup[] {
  const groups = new Map<string, Incident[]>()
  for (const incident of incidents) {
    const area = areaOf(incident)
    const members = groups.get(area)
    if (members) members.push(incident)
    else groups.set(area, [incident])
  }
  const rank = (members: Incident[]) => ({
    withdraw: members.some((i) => i.withdraw?.active) ? 1 : 0,
    severity: Math.max(...members.map((i) => SEVERITY_RANK[i.severity] ?? 0)),
    newest: Math.max(...members.map(incidentNumber)),
  })
  return [...groups.entries()]
    .map(([area, members]) => ({ area, incidents: members, rank: rank(members) }))
    .sort(
      (a, b) =>
        b.rank.withdraw - a.rank.withdraw ||
        b.rank.severity - a.rank.severity ||
        b.rank.newest - a.rank.newest ||
        a.area.localeCompare(b.area),
    )
    .map(({ area, incidents: members }) => ({ area, incidents: members }))
}

/** The queue in the order it is shown, so the first row is the default selection. */
export function flattenGroups(groups: AreaGroup[]): Incident[] {
  return groups.flatMap((g) => g.incidents)
}

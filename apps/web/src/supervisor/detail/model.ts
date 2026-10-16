/**
 * What the incident detail screen shows, derived from `GET /incidents/{id}` only.
 * Nothing here decides incident state: no severity, no withdraw, no dispatch.
 */
import type { Incident, IncidentDetail, Observation, Severity, Task, VolunteerCardData } from '../contracts'

const SEVERITY_ORDER: Record<Severity, number> = { none: 0, unknown: 1, smoke: 2, small_flame: 3, large_flame: 4 }

/** What to call a volunteer with no stored name: a short code from the id. A name is never worked out from the id. */
export function volunteerLabel(id: string, lang: 'id' | 'en'): string {
  return `${lang === 'id' ? 'Relawan' : 'Volunteer'} ${id.slice(-4).toUpperCase()}`
}

/** The reporter's name as the API gave it on any of their observations, else on their card, else the short code. */
export function nameOf(detail: Pick<IncidentDetail, 'observations' | 'volunteers'>, id: string, lang: 'id' | 'en'): string {
  const named = detail.observations.find((o) => o.volunteerId === id && o.volunteerName?.trim())
  const card = detail.volunteers?.find((c) => c.volunteerId === id)?.name?.trim()
  return named?.volunteerName?.trim() || card || volunteerLabel(id, lang)
}

export function initialsOf(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** Observations newest first by the phone time, then by id so the order never flickers. */
export function newestFirst(observations: Observation[]): Observation[] {
  return [...observations].sort((a, b) => {
    const at = Date.parse(b.capturedAt) - Date.parse(a.capturedAt)
    return (Number.isNaN(at) ? 0 : at) || a.id.localeCompare(b.id)
  })
}

const TASK_RANK = { withdraw: 3, approved: 2, proposed: 1, rejected: 0 } as const

/**
 * The instruction shown on a volunteer's card. Tasks have no time, so the rule is:
 * an incident withdraw task first, then an approved task, then a proposed one, then a
 * rejected one. Among equals the later one in the list wins.
 */
export function lastTaskFor(tasks: Task[], volunteerId: string): Task | null {
  let best: Task | null = null
  let bestRank = -1
  for (const task of tasks) {
    if (task.volunteerId !== volunteerId) continue
    const rank = task.type === 'withdraw' ? TASK_RANK.withdraw : TASK_RANK[task.status]
    if (rank >= bestRank) {
      best = task
      bestRank = rank
    }
  }
  return best
}

export interface VolunteerRow {
  id: string
  /** The stored display name, when any of this volunteer's reports carried one. */
  name: string | null
  reportCount: number
  latest: Observation | null
  task: Task | null
  /** True when the incident's active withdraw lists this volunteer. */
  withdrawn: boolean
  /** The supervisor read's card for them: every report, the last position, the withdraw state. Null from an older API. */
  card: VolunteerCardData | null
}

/** Everyone the incident knows: reporters, task recipients and withdraw recipients. */
export function volunteersOf(detail: IncidentDetail): VolunteerRow[] {
  const ids = new Set<string>()
  detail.observations.forEach((o) => ids.add(o.volunteerId))
  detail.tasks.forEach((t) => ids.add(t.volunteerId))
  detail.volunteers?.forEach((c) => ids.add(c.volunteerId))
  if (detail.incident.withdraw?.active) detail.incident.withdraw.volunteerIds.forEach((id) => ids.add(id))
  const withdrawn = new Set(detail.incident.withdraw?.active ? detail.incident.withdraw.volunteerIds : [])
  const rows = [...ids].map<VolunteerRow>((id) => {
    const mine = newestFirst(detail.observations.filter((o) => o.volunteerId === id))
    const card = detail.volunteers?.find((c) => c.volunteerId === id) ?? null
    // The card counts every report, so a volunteer a conflict leaves out of `observations` still has their count.
    return {
      id,
      name: mine.find((o) => o.volunteerName?.trim())?.volunteerName?.trim() ?? card?.name?.trim() ?? null,
      reportCount: Math.max(mine.length, card?.reportCount ?? 0),
      latest: mine[0] ?? null,
      task: lastTaskFor(detail.tasks, id),
      withdrawn: withdrawn.has(id),
      card,
    }
  })
  const time = (r: VolunteerRow) => {
    const at = r.card?.lastReportAt ?? r.latest?.capturedAt
    return at ? Date.parse(at) || 0 : -1
  }
  return rows.sort((a, b) => time(b) - time(a) || a.id.localeCompare(b.id))
}

/** The report that set the incident's severity: the newest observation at the incident's level. */
export function highestReport(detail: IncidentDetail): Observation | null {
  const level = SEVERITY_ORDER[detail.incident.severity]
  const match = newestFirst(detail.observations).find((o) => SEVERITY_ORDER[o.severity] === level)
  return match ?? null
}

/** Reports oldest first, as the timeline reads. */
export function timelineOf(detail: IncidentDetail): Observation[] {
  return newestFirst(detail.observations).reverse()
}

export function formatPosition(incident: Pick<Incident, 'lat' | 'lng'>): string {
  const ok = Number.isFinite(incident.lat) && Number.isFinite(incident.lng)
  return ok ? `${incident.lat.toFixed(3)}, ${incident.lng.toFixed(3)}` : '—'
}

/** Whole minutes between two instants, never negative. */
export function minutesBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / 60000))
}

export type LinkState = 'online' | 'lost' | 'restored'

/**
 * `restored` shows for a few seconds after a lost connection comes back, then `online`.
 * `lost` is set while the last read failed.
 */
export function linkState(lost: boolean, restoredUntil: number | null, now: number): LinkState {
  if (lost) return 'lost'
  return restoredUntil !== null && now < restoredUntil ? 'restored' : 'online'
}

/** Straight-line distance in metres between two reported positions. For display only; no rule reads it. */
export function distanceM(a: Pick<Observation, 'lat' | 'lng'>, b: Pick<Observation, 'lat' | 'lng'>): number | null {
  const values = [a.lat, a.lng, b.lat, b.lng]
  if (!values.every(Number.isFinite)) return null
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h))))
}

import type { Digest, JoinRequestStatus, JoinRequestSummary, NearbyIncident } from '../contracts/types'
import { t, type Lang } from '../i18n'
import { compassLabel, compassOf, formatDistance } from './geo'
import { screenStrings } from './strings'

/** Where one nearby fire stands for this volunteer: they can ask, they asked, or the supervisor said no. */
export type NearbyState = 'ask' | 'waiting' | 'declined'

const STATE_OF: Record<JoinRequestStatus, NearbyState> = { pending: 'waiting', declined: 'declined', approved: 'ask' }

/** The volunteer's own request for this incident, or null. */
export function requestFor(digest: Digest | null, incidentId: string): JoinRequestSummary | null {
  return digest?.myJoinRequests?.find((r) => r.incidentId === incidentId) ?? null
}

export function nearbyState(digest: Digest | null, incidentId: string): NearbyState {
  const request = requestFor(digest, incidentId)
  return request ? STATE_OF[request.status] : 'ask'
}

/** The fires near the phone, nearest first, as the API sent them. Empty before the first read or without a position. */
export function nearbyIncidents(digest: Digest | null): NearbyIncident[] {
  return digest?.nearby ?? []
}

/**
 * The one fire the AI card suggests: the nearest one the volunteer can still ask to join and has not put aside.
 * A fire they already asked for, or that was declined, is not suggested again.
 */
export function pickPrompt(digest: Digest | null, dismissed: ReadonlySet<string>): NearbyIncident | null {
  return nearbyIncidents(digest).find((i) => nearbyState(digest, i.id) === 'ask' && !dismissed.has(i.id)) ?? null
}

/** "1.2 KM", "850 M". The unit is upper case because the design sets it in the mono label style. */
export function distanceLabel(metres: number): string {
  const { value, unit } = formatDistance(metres)
  return `${value} ${unit.toUpperCase()}`
}

/** "NE" in English, "TL" in Bahasa Indonesia. */
export function bearingLabel(bearingDeg: number, lang: Lang): string {
  return compassLabel(compassOf(bearingDeg), lang)
}

/** "Sari + 2 on site", "Rizal on site", "4 on site", or null when nobody is on site. */
export function crewLine(incident: Pick<NearbyIncident, 'crewOnSite' | 'reporterName'>, lang: Lang): string | null {
  const total = incident.crewOnSite
  if (total <= 0) return null
  const suffix = t(lang, screenStrings.nearby.onSite)
  const name = incident.reporterName?.trim()
  if (!name) return `${total} ${suffix}`
  return total === 1 ? `${name} ${suffix}` : `${name} + ${total - 1} ${suffix}`
}

const DISMISSED_KEY = 'ember.nearby.dismissed'

interface SessionLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function browserSession(): SessionLike | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

/** Fires the volunteer pressed Not now on. Kept for this browser session only, so a new session suggests them again. */
export function readDismissed(storage: SessionLike | null = browserSession()): Set<string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(DISMISSED_KEY) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

export function saveDismissed(ids: ReadonlySet<string>, storage: SessionLike | null = browserSession()): void {
  try {
    storage?.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
  } catch {
    // Private mode or a full store: the card comes back next time, which is harmless.
  }
}

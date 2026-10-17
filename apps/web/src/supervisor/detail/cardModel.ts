/**
 * What the supervisor read says about a volunteer, as short lines. Every line comes from a stored value on the
 * card; a value the API sent as null is left out, never replaced with a guess.
 */
import { formatTimeZone } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import type { DetailSummary, IncidentDetail, TimelineEntry, VolunteerCardData } from '../contracts'
import { cardCopy, summaryCopy, timelineCopy } from './cardCopy'
import { nameOf } from './model'

/** "120 m from the incident centre", or null when the volunteer has no report. */
export function distanceLine(lang: Lang, card: VolunteerCardData | null): string | null {
  if (!card || card.distanceM === null) return null
  return `${card.distanceM} ${t(lang, cardCopy.distance)}`
}

/** Where the newest report was sent from: "1.482, 102.115 · ±18 m". Null without a position. */
export function placeLine(card: VolunteerCardData | null): string | null {
  if (!card || card.lastLat === null || card.lastLng === null) return null
  if (!Number.isFinite(card.lastLat) || !Number.isFinite(card.lastLng)) return null
  const place = `${card.lastLat.toFixed(3)}, ${card.lastLng.toFixed(3)}`
  const accuracy = accuracyText(card.lastAccuracyM)
  return accuracy ? `${place} · ${accuracy}` : place
}

/**
 * The accuracy the phone reported for a position, in the unit a person reads: "±18 m", "±2.4 km", "±1497 km".
 * The value is stored in metres as the browser gave it. A desktop that locates by network address reports
 * thousands of metres, and that is what this shows, with no change to the stored number. Null when none was reported.
 */
export function accuracyText(accuracyM: number | null | undefined): string | null {
  if (accuracyM === null || accuracyM === undefined || !Number.isFinite(accuracyM) || accuracyM < 0) return null
  if (accuracyM < 1000) return `±${Math.round(accuracyM)} m`
  const km = accuracyM / 1000
  return km < 10 ? `±${km.toFixed(1)} km` : `±${Math.round(km)} km`
}

/** True when the reported accuracy is too wide to place anyone on a map (5 km or more). */
export function isCoarse(accuracyM: number | null | undefined): boolean {
  return typeof accuracyM === 'number' && Number.isFinite(accuracyM) && accuracyM >= 5000
}

/** "Sari · crew lead": the name and the stored team role. The role is left out when none is stored. */
export function nameRole(name: string, card: VolunteerCardData | null): string {
  const role = card?.teamRole?.trim()
  return role ? `${name} · ${role}` : name
}

/** "Tim Pompa A · 120 m from the flame edge" style second line: crew, then distance. Null when neither is stored. */
export function crewDistanceLine(lang: Lang, card: VolunteerCardData | null): string | null {
  const parts = [card?.crewName?.trim() || null, distanceLine(lang, card)].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' · ') : null
}

/** "4G · 64%": what the phone said with its newest report that carried it. Parts it did not send are left out. */
export function linkLine(card: VolunteerCardData | null): string | null {
  const device = card?.device
  if (!device) return null
  const parts = [
    device.network && NETWORKS[device.network] ? NETWORKS[device.network] : null,
    device.batteryPct !== null && device.batteryPct !== undefined ? `${device.batteryPct}%` : null,
  ].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' · ') : null
}

const NETWORKS = { '2g': '2G', '3g': '3G', '4g': '4G', wifi: 'Wi-Fi', unknown: '' } as const

/**
 * "Tim Pompa A · pump team · 41% · 3G · ID": the crew, the team role and what the phone said with its newest report that
 * carried it. Parts the API sent as null are left out. Null when none is stored.
 */
export function profileLine(card: VolunteerCardData | null): string | null {
  if (!card) return null
  const device = card.device
  const parts = [
    card.crewName ?? null,
    card.teamRole ?? null,
    device && device.batteryPct !== null ? `${device.batteryPct}%` : null,
    device?.network && NETWORKS[device.network] ? NETWORKS[device.network] : null,
    device?.language ? device.language.toUpperCase() : null,
  ].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' · ') : null
}

/** What is known about the withdraw reaching this volunteer. Empty when the card has no withdraw. */
export function deliveryFacts(lang: Lang, card: VolunteerCardData | null): string[] {
  const w = card?.withdraw
  if (!w) return []
  const facts: string[] = []
  facts.push(w.heardAt ? `${t(lang, cardCopy.heard)} ${formatTimeZone(w.heardAt)}` : t(lang, cardCopy.notHeard))
  if (w.delivery) facts.push(t(lang, cardCopy.delivery[w.delivery]))
  if (w.sendCount !== null && w.sendCount > 1) facts.push(`${w.sendCount}×`)
  return facts
}

/** "Marked safe 14:41 · by Bu Maya". Parts the API did not store are left out. Null when the volunteer is not safe. */
export function safeStamp(lang: Lang, card: VolunteerCardData | null): string | null {
  const w = card?.withdraw
  if (!w || !w.safe) return null
  const parts = [t(lang, cardCopy.markedSafe)]
  if (w.safeAt) parts[0] += ` ${formatTimeZone(w.safeAt)}`
  if (w.safeBy?.name) parts.push(`${t(lang, cardCopy.by)} ${w.safeBy.name}`)
  return parts.join(' · ')
}

export function cardOf(detail: Pick<IncidentDetail, 'volunteers'>, id: string): VolunteerCardData | null {
  return detail.volunteers?.find((c) => c.volunteerId === id) ?? null
}

/** The summary text in the supervisor's language, falling back to the other language. Null when there is none. */
export function summaryText(lang: Lang, summary: DetailSummary | null | undefined): string | null {
  if (!summary) return null
  const [first, second] = lang === 'id' ? [summary.bahasa, summary.english] : [summary.english, summary.bahasa]
  return first?.trim() || second?.trim() || null
}

export function summarySourceText(lang: Lang, summary: DetailSummary): string | null {
  if (summary.source === 'model') return t(lang, summaryCopy.model)
  if (summary.source === 'template') return t(lang, summaryCopy.template)
  return null
}

/** Who did a timeline action: the volunteer for a heard receipt, "Code" for code, else the stored name, else "Supervisor". */
export function actorOf(detail: IncidentDetail, entry: TimelineEntry, lang: Lang): string {
  if (entry.action === 'task.heard' && entry.volunteerId) return nameOf(detail, entry.volunteerId, lang)
  if (entry.actorId === 'code') return t(lang, timelineCopy.code)
  return entry.actorName ?? t(lang, timelineCopy.supervisor)
}

export function actionText(lang: Lang, entry: TimelineEntry): string {
  return entry.action ? t(lang, timelineCopy.action[entry.action] ?? { id: entry.action, en: entry.action }) : ''
}

/** The volunteer an audit row is about, when it is not the actor: "marked a volunteer safe · Sari". */
export function subjectOf(detail: IncidentDetail, entry: TimelineEntry, lang: Lang): string | null {
  if (!entry.volunteerId || entry.action === 'task.heard') return null
  return nameOf(detail, entry.volunteerId, lang)
}

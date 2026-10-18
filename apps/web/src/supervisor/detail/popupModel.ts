/**
 * What the volunteer pop-up can show from `GET /incidents/{id}`. Every value is read from that
 * answer. A region whose data no route returns is not given invented content: see `popupCopy.gaps`.
 */
import type { Lang } from '../../pwa/i18n'
import type { CardDevice, EvidenceFactor, IncidentDetail, Observation, PhotoRead, Task, Translation } from '../contracts'
import { screenStrings } from '../../pwa/screens/strings'
import { incidentLabel } from '../../pwa/incidentName'
import { cardOf, distanceLine, placeLine } from './cardModel'
import { answerCopy, profileCopy, visionCopy } from './instructionCopy'
import { formatPosition, initialsOf, nameOf } from './model'

export interface PopupProfile {
  id: string
  name: string
  initials: string
  incidentName: string
  incidentId: string
  /** Position of the newest report, or null when the volunteer has not reported. */
  position: string | null
  accuracyM: number | null
  /** Capture time of the first report on this incident, the nearest thing the API has to "on site since". */
  firstReportAt: string | null
  lastReportAt: string | null
  reportCount: number
  /** "120 m from the incident centre" from the supervisor read's card, or null. */
  distance: string | null
  /** The latest of their newest report arriving and their app showing a task. Null when neither exists. */
  lastHeardAt: string | null
  /** A push token is stored for them. Null from an older API that sends no card. */
  pushReady: boolean | null
  /** The crew on their profile and the role stored when they joined. Null until stored, or from an older API. */
  crew: string | null
  role: string | null
  /**
   * What the phone said with its newest report that carried it. Network falls back to the live seat's signal.
   * Null parts are not stored. The whole value is null from an older API.
   */
  device: CardDevice | null
  /** The live seat's signal for this volunteer when it is not `unknown`. More current than the report's network. */
  liveSignal: CardDevice['network']
}

export interface Popup {
  profile: PopupProfile
  /** The volunteer's reports, newest first. */
  reports: Observation[]
  /** Photo reports, newest first. Their images are private and no route returns one yet. */
  photos: Observation[]
  /** Video reports, newest first. */
  videos: Observation[]
  /** Instructions for this volunteer in the order the API returned them. */
  tasks: Task[]
  /** True when the volunteer has a withdraw task or is on the incident's active withdraw. */
  withdrawn: boolean
  /** What EMBER proposes for this volunteer and waits for a supervisor to decide: their proposed tasks. */
  suggestions: Task[]
  /** True when the incident has a conflict, the one reason agents give for a proposed verify task. */
  hasConflict: boolean
  /** The factors behind the incident's evidence score, as agents stored them. */
  factors: EvidenceFactor[]
  /** The advisory read of each photo report, by observation id. `{}` when none was read or from an older API. */
  photoReads: Record<string, PhotoRead>
  /** The stored English translation of each report's text, by observation id. `{}` when none or from an older API. */
  translations: Record<string, Translation>
}

const NETWORK_NAME = { '2g': '2G', '3g': '3G', '4g': '4G', wifi: 'Wi-Fi', unknown: '' } as const

/** "3G", "Wi-Fi", or null. The live signal wins over the report's network when it is known. */
export function networkText(profile: Pick<PopupProfile, 'device' | 'liveSignal'>): string | null {
  const network = profile.liveSignal ?? profile.device?.network ?? null
  return network && NETWORK_NAME[network] ? NETWORK_NAME[network] : null
}

export function batteryText(device: CardDevice | null): string | null {
  return device && device.batteryPct !== null ? `${device.batteryPct}%` : null
}

export function languageText(lang: Lang, device: CardDevice | null): string | null {
  return device?.language ? profileCopy.languageName[device.language][lang] : null
}

/** What the photo read says in one line: smoke, flame, burn scar, then the model's short note. Null when nothing was read. */
export function visionLine(lang: Lang, read: PhotoRead | undefined): string | null {
  if (!read) return null
  const parts: string[] = []
  if (read.smokeVisible !== null) parts.push(visionCopy[read.smokeVisible ? 'smoke' : 'noSmoke'][lang])
  if (read.flameVisible && read.flameVisible in visionCopy.flame) parts.push(visionCopy.flame[read.flameVisible as keyof typeof visionCopy.flame][lang])
  if (read.burnScarVisible) parts.push(visionCopy.burnScar[lang])
  if (read.notes) parts.push(`“${read.notes}”`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** "Accepted" or "Declined · Too far", with the volunteer's note. Null while the volunteer has not answered. */
export function answerLine(lang: Lang, task: Task, format: (value: string) => string): string | null {
  if (task.declinedAt) {
    const reason = task.declineReason ? screenStrings.decline.reasons[task.declineReason]?.[lang] : null
    return [`${answerCopy.declined[lang]} ${format(task.declinedAt)}`, reason, task.declineNote?.trim() || null].filter(Boolean).join(' · ')
  }
  if (task.acceptedAt) return [
    `${answerCopy.accepted[lang]} ${format(task.acceptedAt)}`,
    task.acceptResponse ? screenStrings.accept.responses[task.acceptResponse]?.[lang] : null,
    task.acceptNote?.trim() || null,
  ].filter(Boolean).join(' · ')
  return null
}

function byTimeDesc(a: Observation, b: Observation): number {
  return (Date.parse(b.capturedAt) || 0) - (Date.parse(a.capturedAt) || 0)
}

/** Null when the incident does not know this volunteer (a stale link, or a volunteer removed by a refresh). */
export function popupFor(detail: IncidentDetail, volunteerId: string, lang: Lang): Popup | null {
  const reports = detail.observations.filter((o) => o.volunteerId === volunteerId).sort(byTimeDesc)
  const tasks = detail.tasks.filter((t) => t.volunteerId === volunteerId)
  const onWithdraw = Boolean(detail.incident.withdraw?.active && detail.incident.withdraw.volunteerIds.includes(volunteerId))
  const card = cardOf(detail, volunteerId)
  if (reports.length === 0 && tasks.length === 0 && !onWithdraw && !card) return null
  const newest = reports[0] ?? null
  const oldest = reports[reports.length - 1] ?? null
  const name = nameOf(detail, volunteerId, lang)
  const liveSignal = detail.liveSeat?.volunteers[volunteerId]?.signal ?? 'unknown'
  return {
    profile: {
      id: volunteerId,
      name,
      initials: initialsOf(name),
      incidentName: incidentLabel(detail.incident, lang),
      incidentId: detail.incident.id,
      // The card covers reports a conflict leaves out of `observations`.
      position: newest ? formatPosition(newest) : placeLine(card)?.split(' · ')[0] ?? null,
      accuracyM: newest ? newest.accuracyM ?? null : card?.lastAccuracyM ?? null,
      firstReportAt: oldest?.capturedAt ?? card?.firstReportAt ?? null,
      lastReportAt: newest?.capturedAt ?? card?.lastReportAt ?? null,
      reportCount: Math.max(reports.length, card?.reportCount ?? 0),
      distance: distanceLine(lang, card),
      lastHeardAt: card?.lastHeardAt ?? null,
      pushReady: card ? card.pushReady : null,
      crew: card?.crewName ?? null,
      role: card?.teamRole ?? null,
      device: card?.device ?? null,
      liveSignal: liveSignal !== 'unknown' ? liveSignal : null,
    },
    reports,
    photos: reports.filter((o) => o.source === 'photo'),
    videos: reports.filter((o) => o.source === 'video'),
    tasks,
    withdrawn: onWithdraw || tasks.some((t) => t.type === 'withdraw'),
    suggestions: tasks.filter((t) => t.status === 'proposed'),
    hasConflict: detail.conflict !== null,
    factors: detail.evidenceFactors ?? [],
    photoReads: detail.photoReads ?? {},
    translations: detail.translations ?? {},
  }
}

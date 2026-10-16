/**
 * What the volunteer pop-up can show from `GET /incidents/{id}`. Every value is read from that
 * answer. A region whose data no route returns is not given invented content: see `popupCopy.gaps`.
 */
import type { Lang } from '../../pwa/i18n'
import type { IncidentDetail, Observation, Task } from '../contracts'
import { formatPosition, initialsOf, nameOf } from './model'

export interface PopupProfile {
  id: string
  name: string
  initials: string
  incidentName: string | null
  incidentId: string
  /** Position of the newest report, or null when the volunteer has not reported. */
  position: string | null
  accuracyM: number | null
  /** Capture time of the first report on this incident, the nearest thing the API has to "on site since". */
  firstReportAt: string | null
  lastReportAt: string | null
  reportCount: number
}

export interface Popup {
  profile: PopupProfile
  /** The volunteer's reports, newest first. */
  reports: Observation[]
  /** Photo reports, newest first. Their images are private and no route returns one yet. */
  photos: Observation[]
  /** Instructions for this volunteer in the order the API returned them. */
  tasks: Task[]
  /** True when the volunteer has a withdraw task or is on the incident's active withdraw. */
  withdrawn: boolean
}

function byTimeDesc(a: Observation, b: Observation): number {
  return (Date.parse(b.capturedAt) || 0) - (Date.parse(a.capturedAt) || 0)
}

/** Null when the incident does not know this volunteer (a stale link, or a volunteer removed by a refresh). */
export function popupFor(detail: IncidentDetail, volunteerId: string, lang: Lang): Popup | null {
  const reports = detail.observations.filter((o) => o.volunteerId === volunteerId).sort(byTimeDesc)
  const tasks = detail.tasks.filter((t) => t.volunteerId === volunteerId)
  const onWithdraw = Boolean(detail.incident.withdraw?.active && detail.incident.withdraw.volunteerIds.includes(volunteerId))
  if (reports.length === 0 && tasks.length === 0 && !onWithdraw) return null
  const newest = reports[0] ?? null
  const oldest = reports[reports.length - 1] ?? null
  const name = nameOf(detail, volunteerId, lang)
  return {
    profile: {
      id: volunteerId,
      name,
      initials: initialsOf(name),
      incidentName: detail.incident.name ?? null,
      incidentId: detail.incident.id,
      position: newest ? formatPosition(newest) : null,
      accuracyM: newest?.accuracyM ?? null,
      firstReportAt: oldest?.capturedAt ?? null,
      lastReportAt: newest?.capturedAt ?? null,
      reportCount: reports.length,
    },
    reports,
    photos: reports.filter((o) => o.source === 'photo'),
    tasks,
    withdrawn: onWithdraw || tasks.some((t) => t.type === 'withdraw'),
  }
}

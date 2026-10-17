/**
 * Types from docs/contracts/shared-contract.md (sections 4, 5 and 6).
 * This is the only file in src/pwa that defines contract shapes.
 */
import type { Me } from '../../auth/api'

export type { Me }

export type ObservationSource = 'live' | 'chip' | 'text' | 'photo'
export type ChipValue = 'asap' | 'api' | 'aman' | 'butuh_bantuan'
export type Severity = 'none' | 'smoke' | 'small_flame' | 'large_flame' | 'unknown'
export type IncidentStatus = 'open' | 'held' | 'verified' | 'extinguished'
export type TaskType = 'verify' | 'withdraw' | 'investigate' | 'instruct'
export type TaskStatus = 'proposed' | 'approved' | 'rejected'

export const CHIP_VALUES: readonly ChipValue[] = ['asap', 'api', 'aman', 'butuh_bantuan']

/** What the phone says about itself with a report (section 5.1). Every part is optional and best effort. */
export interface ObservationDevice {
  /** 0 to 100. */
  batteryPct?: number
  network?: '2g' | '3g' | '4g' | 'wifi' | 'unknown'
  /** The language the app is shown in. */
  language?: 'id' | 'en'
}

/** Where agents placed a report (section 6.2). Absent or null until they have. */
export interface ObservationJoin {
  incidentId: string
  incidentName: string | null
  incidentArea: string | null
  /** True when the report joined an incident another report had opened, false when it started one. */
  joined: boolean
  /** Other reports, from other volunteers, within `radiusM` of this one when it arrived. */
  nearbyCount: number
  /** Metres to the nearest of them. Null when `nearbyCount` is 0. */
  nearestM: number | null
  /** The join radius in metres. */
  radiusM: number
}

/** One row of the digest's `sentToday` (section 5.6): a report this volunteer sent. */
export interface SentReport {
  id: string
  capturedAt: string
  receivedAt: string
  source: ObservationSource
  chip: ChipValue | null
  text: string | null
  accuracyM: number | null
  clientId?: string
  join: ObservationJoin | null
}

/** Body of POST /observations (section 6.2). The server fills id, volunteerId, receivedAt, severity, photoPath and immutable. */
export interface ObservationCreate {
  source: 'chip' | 'text'
  capturedAt: string
  lat: number
  lng: number
  accuracyM: number | null
  chip: ChipValue | null
  text: string | null
  /** Outbox item id. Sending it again returns the stored report instead of creating another. */
  clientId?: string
  device?: ObservationDevice
}

/**
 * Photo observation body. Same shape as section 6.2 plus the private object path
 * returned by POST /photos/upload-url. Sent only after the upload succeeded.
 */
export interface PhotoObservationCreate {
  source: 'photo'
  capturedAt: string
  lat: number
  lng: number
  accuracyM: number | null
  chip: null
  text: string | null
  photoPath: string
  clientId?: string
  device?: ObservationDevice
}

export type ObservationRequest = ObservationCreate | PhotoObservationCreate

/** Body of POST /photos/upload-url. */
export interface UploadUrlRequest {
  contentType: PhotoContentType
}

export type PhotoContentType = 'image/jpeg' | 'image/webp'

/** Response of POST /photos/upload-url: a short-lived signed PUT URL and the private object path. */
export interface UploadUrl {
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
  photoPath: string
  expiresAt: string
}

/** Stored observation (section 5.1). */
export interface Observation {
  id: string
  volunteerId: string
  capturedAt: string
  receivedAt: string
  source: ObservationSource
  lat: number
  lng: number
  accuracyM: number | null
  chip: ChipValue | null
  text: string | null
  severity: Severity
  photoPath: string | null
  immutable: true
  /** Present when the report was sent with a clientId. */
  clientId?: string
  /** Present when the phone sent it. */
  device?: ObservationDevice
  /** Only on the create response, and only once agents have placed the report (section 6.2). */
  join?: ObservationJoin
}

export interface Withdraw {
  active: true
  instruction: string
  reasons: string[]
  volunteerIds: string[]
  /** Who sent it. Absent on a withdraw written before these fields existed. */
  source?: 'code' | 'supervisor'
  /** When it was first sent (ISO). Absent on an older withdraw. */
  sentAt?: string
  /** Volunteers a supervisor marked found safe. Absent on an older withdraw. */
  safeVolunteerIds?: string[]
}

/** Incident as `GET /incidents/{id}` returns it (section 5.2). The digest summary plus the evidence score. */
export interface IncidentRecord extends IncidentSummary {
  evidenceScore?: number | null
  conflictId?: string | null
}

export interface Conflict {
  id: string
  incidentId: string
  observationIds: string[]
  higherSeverity: Severity
  status: 'open' | 'resolved' | string
  dispatchHeld: boolean
}

/** Join row on `incident_members` (section 5.7 / 6.11). Optional fields are null until stored. */
export interface IncidentMembership {
  incidentId: string
  volunteerId: string
  joinedAt: string
  addedBy: string
  addedByName: string | null
  teamRole: string | null
  enRouteAt: string | null
  destination: string | null
  approach: string | null
  meetPoint: string | null
  meetPerson: string | null
  meetNote: string | null
}

/** `GET /incidents/{id}` for a volunteer who is on the incident (section 6.3). */
export interface IncidentDetail {
  incident: IncidentRecord
  observations: Observation[]
  conflict: Conflict | null
  tasks: Task[]
  /** Present when this volunteer has an `incident_members` row (#135). */
  membership?: IncidentMembership | null
}

/** Incident summary as carried in the digest (section 5.6). */
export interface IncidentSummary {
  id: string
  /** Readable label from agents, such as "Bengkalis, Riau · Sari · #3". Absent or null on older incidents. */
  name?: string | null
  /** Place part of the name, such as "Bengkalis, Riau". Absent or null on older incidents. */
  area?: string | null
  status: IncidentStatus
  severity: Severity
  withdraw: Withdraw | null
  lat: number
  lng: number
}

export interface Task {
  id: string
  incidentId: string
  volunteerId: string
  type: TaskType
  status: TaskStatus
  instruction: string | null
  /** When it was last sent (ISO). Absent or null on a task never sent, and on one sent before receipts. */
  sentAt?: string | null
  /** When the volunteer's app showed or spoke it. Absent or null until then. */
  heardAt?: string | null
  /** 1 for the first send, one more for each resend. */
  sendCount?: number | null
  /** When a sent, unheard task can be sent again. Computed by ember-api, null otherwise. */
  resendAt?: string | null
  /** When the volunteer tapped Doing it. Absent or null until then. */
  acceptedAt?: string | null
  /** When the volunteer said they cannot do it, with the reason key and the optional note. Absent or null until then. */
  declinedAt?: string | null
  declineReason?: DeclineReason | null
  declineNote?: string | null
  /** Lead closed thank-you (#140). Set when a supervisor verifies the incident. */
  closedAt?: string | null
  closedBy?: string | null
  closedByName?: string | null
  closeMessage?: string | null
}

/** Season counts on a volunteer's digest for the lead-closed screen (#140). */
export interface SeasonStats {
  checksDone: number | null
  falseAlarmsCleared: number | null
}

export type Localized = { id: string; en: string }

export interface TrainingLesson {
  id: string
  title: Localized
  minutes: number
  summary: Localized
  body: Localized
  status: 'not_started' | 'in_progress' | 'done'
  score?: number | null
}

export interface TrainingPayload {
  video: { id: string; title: Localized; durationSec: number; url: string | null; progressSec: number }
  lessons: TrainingLesson[]
  doneCount: number
  lessonCount: number
  askChips: { id: string; label: Localized }[]
  safetyLines: Localized[]
}

export interface PracticeResponse {
  practice: true
  reply: Localized
  correct: boolean | null
  check: {
    question: Localized
    options: { id: string; label: Localized }[]
    lessonId: string
  } | null
  safetyLines: Localized[]
}

/** Why a volunteer cannot follow an instruction (contract section 6.11). Labels come from the copy bundle. */
export const DECLINE_REASONS = ['unsafe', 'too_far', 'no_equipment', 'other'] as const
export type DeclineReason = (typeof DECLINE_REASONS)[number]

/** Why a volunteer says someone else's report is wrong (contract section 6.11). Labels come from the copy bundle. */
export const FLAG_REASONS = ['no_fire', 'duplicate', 'old_photo', 'wrong_place', 'fake'] as const
export type FlagReason = (typeof FLAG_REASONS)[number]

/** Body of POST /observations/{id}/flag (section 6.11). `photoPath` comes from POST /photos/upload-url. */
export interface FlagRequest {
  reason: FlagReason
  photoPath?: string | null
}

/** Body of POST /incidents/{id}/withdraw/answer (section 6.11). */
export interface WithdrawAnswerRequest {
  state: 'safe' | 'stuck'
  lat?: number
  lng?: number
  accuracyM?: number | null
}

/** Nearby live incident on a volunteer's digest (section 5.6). */
export interface NearbyIncident extends IncidentSummary {
  distanceM: number
  bearingDeg: number | null
  crewOnSite: number
  /** What the supervisor asked for. Null until stored — the phone omits the line. */
  ask: string | null
}

/** Optional phone position for `GET /digest?lat=&lng=` so nearby can be computed. */
export interface DigestPosition {
  lat: number
  lng: number
}

/** GET /digest (section 6.4). */
export interface Digest {
  updatedAt: string
  incidents: IncidentSummary[]
  myTasks: Task[]
  /** Volunteer only. Empty without a usable position. Omitted for a supervisor. */
  nearby?: NearbyIncident[]
  /** Volunteer season counts for #140. Omitted when nothing is stored. */
  seasonStats?: SeasonStats | null
  /** Volunteer only, and only when the request carried `sentSince` (section 6.4). Oldest first, at most 50. */
  sentToday?: SentReport[]
}

/** Optional parts of the digest request. */
export interface DigestOptions {
  /** ISO time with a zone: the start of the volunteer's day. Asks for `sentToday`. */
  sentSince?: string
}

/** Error body (section 3). `fields` is present on validation_error only. */
export interface ErrorBody {
  error: {
    code: string
    message: string
    fields?: Record<string, string>
  }
}

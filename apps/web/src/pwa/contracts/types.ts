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

/** `GET /incidents/{id}` for a volunteer who is on the incident (section 6.3). */
export interface IncidentDetail {
  incident: IncidentRecord
  observations: Observation[]
  conflict: Conflict | null
  tasks: Task[]
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
}

/** Why a volunteer cannot follow an instruction (contract section 6.11). Labels come from the copy bundle. */
export const DECLINE_REASONS = ['unsafe', 'too_far', 'no_equipment', 'other'] as const
export type DeclineReason = (typeof DECLINE_REASONS)[number]

/** Body of POST /incidents/{id}/withdraw/answer (section 6.11). */
export interface WithdrawAnswerRequest {
  state: 'safe' | 'stuck'
  lat?: number
  lng?: number
  accuracyM?: number | null
}

/** GET /digest (section 6.4). */
export interface Digest {
  updatedAt: string
  incidents: IncidentSummary[]
  myTasks: Task[]
}

/** Error body (section 3). `fields` is present on validation_error only. */
export interface ErrorBody {
  error: {
    code: string
    message: string
    fields?: Record<string, string>
  }
}

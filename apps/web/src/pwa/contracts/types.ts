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
export type TaskType = 'verify' | 'withdraw' | 'investigate'
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
}

/** Incident summary as carried in the digest (section 5.6). */
export interface IncidentSummary {
  id: string
  /** Readable label from agents, such as "Bengkalis, Riau · Sari · #3". Absent or null on older incidents. */
  name?: string | null
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

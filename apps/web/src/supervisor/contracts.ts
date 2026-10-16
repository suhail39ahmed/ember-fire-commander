/**
 * Supervisor shapes from docs/contracts/shared-contract.md (sections 5.2, 5.4, 5.5, 5.7, 6.3 and 6.5).
 * Shared enums and records come from the PWA contract file so there is one source.
 */
import type { IncidentStatus, Observation as StoredObservation, Severity, Task, Withdraw } from '../pwa/contracts/types'

export type { IncidentStatus, Severity, Task, Withdraw }

/** An observation as a supervisor reads it. `volunteerName` is on it when one was stored (section 6.3). */
export type Observation = StoredObservation & { volunteerName?: string }

/** Full incident record (section 5.2). */
export interface Incident {
  id: string
  /** Readable label from agents, such as "Bengkalis, Riau · Sari · #3". Absent or null on older incidents. */
  name?: string | null
  /** Place part of the name, such as "Bengkalis, Riau". Absent or null on older incidents. */
  area?: string | null
  status: IncidentStatus
  severity: Severity
  evidenceScore: number
  conflictId: string | null
  withdraw: Withdraw | null
  lat: number
  lng: number
}

/** One factor behind `evidenceScore`, written by agents fusion (section 5.2). */
export interface EvidenceFactor {
  factor: 'severity' | 'corroboration' | 'photo' | 'gps' | 'conflict'
  points: number
  detail: string
}

/**
 * Incident as stored by the agents (section 5.2). The REST routes return only
 * `Incident`. `observationIds` is never in a response; `evidenceFactors` is returned
 * only on a supervisor's `GET /incidents/{id}`, beside the incident (section 6.3).
 */
export interface StoredIncident extends Incident {
  observationIds: string[]
  evidenceFactors: EvidenceFactor[]
}

/** Conflict (section 5.4). Both observations stay side by side; nothing is averaged. */
export interface Conflict {
  id: string
  incidentId: string
  observationIds: string[]
  higherSeverity: Severity
  status: 'open' | 'resolved'
  dispatchHeld: true
}

/** GET /incidents/{id} (section 6.3). */
export interface IncidentDetail {
  incident: Incident
  observations: Observation[]
  conflict: Conflict | null
  tasks: Task[]
  /** Supervisor read only. `[]` when none are stored. Absent from an older API. */
  evidenceFactors?: EvidenceFactor[]
}

/** Task decisions (section 6.5). */
export interface TaskDecision {
  task: Task
  auditId: string
}

/** Incident decisions (section 6.5). */
export interface IncidentDecision {
  incident: Incident
  auditId: string
}

/** Body of POST /incidents/{id}/withdraw (section 6.5). `reasons` defaults to [] on the server. */
export interface WithdrawRequest {
  volunteerIds: string[]
  instruction: string
  reasons?: string[]
}
/** Severities `POST /incidents/{id}/severity` accepts (section 6.5). `unknown` is refused with 400. */
export type LowerableSeverity = Exclude<Severity, 'unknown'>

/** Audit actions (section 5.5). `site.reinspect` is written by code when the re-ignition watch raises an alert. */
export type AuditAction =
  | 'observation.create'
  | 'task.approve'
  | 'task.reject'
  | 'task.edit'
  | 'task.withdraw'
  | 'incident.verify'
  | 'incident.extinguish'
  | 'incident.severity.lower'
  | 'incident.severity.raise'
  | 'site.reinspect'

/** Advisory photo triage, collection `photo_triage`, one per observation (section 5.7). */
export interface PhotoTriage {
  id: string
  observationId: string
  volunteerId: string | null
  photoPath: string | null
  status: 'ok' | 'rejected' | 'error'
  advisory: true
  model: string | null
  result: {
    smokeVisible: boolean
    flameVisible: 'none' | 'small' | 'large' | 'unclear'
    burnScarVisible: boolean
    notes: string
    confidence: 'low' | 'medium' | 'high'
  } | null
  /** Why the photo was rejected. Present when `status` is `rejected`. */
  reason?: string
  /** Short failure reason. Present when `status` is `error`. */
  error?: string
  at: string
}

/** Advisory incident summary, collection `incident_summaries`, one per incident (section 5.7). */
export interface IncidentSummary {
  id: string
  incidentId: string
  english: string
  bahasa: string
  source: 'model' | 'template'
  advisory: true
  model: string | null
  facts: {
    incidentId: string
    reportCount: number
    volunteerCount: number
    reportsDisagree: boolean
    reports: {
      source: string | null
      chip: string | null
      text: string | null
      capturedAt: string | null
      hasPhoto: boolean
    }[]
    photoDescriptions: {
      smokeVisible: boolean
      flameVisible: string
      burnScarVisible: boolean
      notes: string
    }[]
  }
  at: string
}

/** One re-inspection alert on a watched site (section 5.7). */
export interface SiteAlert {
  id: string
  kind: 'observation' | 'lead'
  sourceId: string
  distanceM: number
  itemAt: string
  at: string
  message: string
}

/** Watched extinguished site, collection `sites`, id is the incident id (section 5.7). */
export interface Site {
  id: string
  incidentId: string
  lat: number
  lng: number
  radiusM: number
  extinguishedAt: string
  /** End of the watch window. Records made before the window existed do not have it. */
  expiresAt?: string
  observationIds: string[]
  status: 'watching' | 'reinspect' | 'expired'
  /** Newest alerts only. */
  alerts: SiteAlert[]
  lastAlertAt?: string
}

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
  /**
   * Supervisor list only (section 6.3): what the list card shows. Absent on a volunteer's list and
   * on older servers, so a card with no value shows a dash rather than a made-up number.
   */
  reportCount?: number
  volunteerCount?: number
  /** True when any report on the incident used the "Need help" chip. */
  needsHelp?: boolean
  /** True when a verify action is on record, even if the verifier's name was not stored. */
  verified?: boolean
  verifiedBy?: string | null
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

/** What a supervisor's read says about one volunteer's withdraw (section 6.3). Every field is null until stored. */
export interface VolunteerWithdraw {
  sentAt: string | null
  /** When the volunteer's app said it showed the instruction. No app calls the route yet. */
  heardAt: string | null
  sendCount: number | null
  /** The last push result for the withdraw task. */
  delivery: 'sent' | 'failed' | 'skipped' | null
  safe: boolean
  /** From the audit row written when a supervisor marked them safe. Null for an older mark. */
  safeAt: string | null
  safeBy: { id: string; name: string | null } | null
}

/** One volunteer on the incident, counting every report (section 6.3). */
export interface VolunteerCardData {
  volunteerId: string
  name: string | null
  reportCount: number
  firstReportAt: string | null
  lastReportAt: string | null
  lastSeverity: Severity | null
  lastLat: number | null
  lastLng: number | null
  lastAccuracyM: number | null
  /** Metres from the incident's centre to their newest report. Not the distance to the flame edge. */
  distanceM: number | null
  /** The latest of their newest report arriving and their app showing a task. Null when neither exists. */
  lastHeardAt: string | null
  /** A device token is stored for them. Only this yes or no is sent, never the token. */
  pushReady: boolean
  withdraw: VolunteerWithdraw | null
}

/** One line of the incident's history, oldest first (section 6.3). */
export interface TimelineEntry {
  kind: 'report' | 'audit'
  id: string
  at: string
  action: AuditAction | null
  actorId: string | null
  actorName: string | null
  volunteerId: string | null
  taskId: string | null
  severity: Severity | null
  source: Observation['source'] | null
  chip: Observation['chip'] | null
  text: string | null
}

/** The stored advisory summary of the incident (section 6.3). It states no severity. */
export interface DetailSummary {
  english: string | null
  bahasa: string | null
  source: 'model' | 'template' | null
  at: string | null
}

/**
 * What a supervisor's read adds for an incident with a conflict (section 6.3). Both lists are `[]` when nothing is stored.
 * No wind or satellite factor, no "conflict opened" audit row and no `investigate` proposal exists to return.
 */
export interface ConflictContext {
  /** Reports on neither side of the disagreement (smoke or unknown), oldest first. `observations` lists only the two sides. */
  otherObservations: Observation[]
  /** Recorded decisions on the conflict's verify and investigate tasks and on the incident, oldest first. */
  audit: TimelineEntry[]
}

/** GET /incidents/{id} (section 6.3). */
export interface IncidentDetail {
  incident: Incident
  observations: Observation[]
  conflict: Conflict | null
  tasks: Task[]
  /** Supervisor read only. `[]` when none are stored. Absent from an older API. */
  evidenceFactors?: EvidenceFactor[]
  /** Supervisor read only: phone numbers stored for the volunteers on an active withdraw. */
  volunteerPhones?: Record<string, string>
  /** Supervisor read only. One card per volunteer, covering every report. Absent from an older API. */
  volunteers?: VolunteerCardData[]
  /** Supervisor read only. Reports and audit rows, oldest first. Absent from an older API. */
  timeline?: TimelineEntry[]
  /** Supervisor read only. Null until a summary is stored. */
  summary?: DetailSummary | null
  /** Supervisor read only. Null when the incident has no conflict. Absent from an older API. */
  conflictContext?: ConflictContext | null
  /** Supervisor read only. The agency stored on the incident. Null until one is stored, which nothing does yet. Absent from an older API. */
  agencyInCharge?: string | null
}

/** Task decisions (section 6.5). */
export interface TaskDecision {
  task: Task
  auditId: string
  /** The supervisor who saved an edit, from their token. Only on the edit route, and absent when the token has no name. */
  editedBy?: string
}

/** Incident decisions (section 6.5). */
export interface IncidentDecision {
  incident: Incident
  auditId: string
}

/** What a short-lived signed read of one photo report returns (section 6.7). */
export interface PhotoUrl {
  url: string
  expiresAt: string
}

/** Body of POST /incidents/{id}/withdraw/safe (section 6.5). */
export interface MarkSafeRequest {
  volunteerId: string
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
  | 'task.heard'
  | 'task.instruct'
  | 'task.resend'
  | 'task.withdraw'
  | 'withdraw.safe'
  | 'incident.verify'
  | 'incident.extinguish'
  | 'incident.severity.lower'
  | 'incident.severity.raise'
  | 'site.reinspect'
  | 'site.dismiss'
  | 'site.recheck'

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

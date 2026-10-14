/**
 * Supervisor shapes from docs/contracts/shared-contract.md (sections 5.2, 5.4, 6.3 and 6.5).
 * Shared enums and records come from the PWA contract file so there is one source.
 */
import type { IncidentStatus, Observation, Severity, Task, Withdraw } from '../pwa/contracts/types'

export type { IncidentStatus, Observation, Severity, Task, Withdraw }

/** Full incident record (section 5.2). */
export interface Incident {
  id: string
  status: IncidentStatus
  severity: Severity
  evidenceScore: number
  conflictId: string | null
  withdraw: Withdraw | null
  lat: number
  lng: number
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

import type { Digest, IncidentSummary, Task } from '../contracts/types'

/** Incidents still being worked: everything the digest lists except an extinguished fire. */
export function liveIncidents(digest: Digest | null): IncidentSummary[] {
  return (digest?.incidents ?? []).filter((incident) => incident.status !== 'extinguished')
}

/** Extinguished incidents this volunteer is linked to. */
export function completedIncidents(digest: Digest | null): IncidentSummary[] {
  return (digest?.incidents ?? []).filter((incident) => incident.status === 'extinguished')
}

/**
 * Tasks sent to this volunteer that they can act on. A proposed task is still waiting for the
 * supervisor and a rejected one is dead, so neither is shown. WITHDRAW is not a list row: it
 * covers the whole phone instead.
 */
export function assignedTasks(digest: Digest | null): Task[] {
  return (digest?.myTasks ?? []).filter(
    (task) => task.status === 'approved' && task.type !== 'withdraw' && !task.closedAt,
  )
}

export function findIncident(digest: Digest | null, id: string): IncidentSummary | null {
  return digest?.incidents.find((incident) => incident.id === id) ?? null
}

export function findTask(digest: Digest | null, id: string): Task | null {
  return digest?.myTasks.find((task) => task.id === id) ?? null
}

export type IncidentsTab = 'live' | 'completed'

export function parseTab(value: string | null): IncidentsTab {
  return value === 'completed' ? 'completed' : 'live'
}

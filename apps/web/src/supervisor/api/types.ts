import type { Incident, IncidentDecision, IncidentDetail, TaskDecision } from '../contracts'

/**
 * The ember-api operations the supervisor console uses.
 * There is deliberately no call that clears a withdraw, sets extinguished from here,
 * or lowers severity: the console only offers the routes in section 6.5 it shows.
 */
export interface SupervisorApi {
  listIncidents(): Promise<Incident[]>
  getIncident(id: string): Promise<IncidentDetail>
  approveTask(id: string): Promise<TaskDecision>
  rejectTask(id: string): Promise<TaskDecision>
  editTask(id: string, instruction: string): Promise<TaskDecision>
  verifyIncident(id: string): Promise<IncidentDecision>
}

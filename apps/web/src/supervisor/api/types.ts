import type { Incident, IncidentDecision, IncidentDetail, LowerableSeverity, TaskDecision, WithdrawRequest } from '../contracts'

/**
 * The ember-api operations the supervisor console uses.
 * There is deliberately no call that clears a withdraw: withdraw is issued by code or by
 * the supervisor, and only ever added to.
 */
export interface SupervisorApi {
  listIncidents(): Promise<Incident[]>
  getIncident(id: string): Promise<IncidentDetail>
  approveTask(id: string): Promise<TaskDecision>
  rejectTask(id: string): Promise<TaskDecision>
  editTask(id: string, instruction: string): Promise<TaskDecision>
  verifyIncident(id: string): Promise<IncidentDecision>
  /** Immediate. No approval step: the route sets the incident withdraw and one approved task per volunteer. */
  withdrawIncident(id: string, request: WithdrawRequest): Promise<IncidentDecision>
  /** Records that a supervisor found a withdrawn volunteer safe. Audited. It never clears the withdraw. */
  markWithdrawSafe(id: string, volunteerId: string): Promise<IncidentDecision>
  /** Stores a strictly lower severity. An active withdraw stays in effect. Only code can raise severity. */
  lowerSeverity(id: string, severity: LowerableSeverity): Promise<IncidentDecision>
  /** Human only, and the console cannot undo it. `409` when the incident is already extinguished. */
  extinguishIncident(id: string): Promise<IncidentDecision>
}

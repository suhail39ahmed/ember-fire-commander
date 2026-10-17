import type { AskAnswer, DetailSuggestions, Incident, IncidentDecision, IncidentDetail, JoinDecision, LiveSeat, PendingJoinRequest, LowerableSeverity, PhotoUrl, VideoUrl, ProposedTask, TaskDecision, Translation, WithdrawRequest } from '../contracts'

export interface LiveSeatDecision {
  liveSeat: LiveSeat
  auditId: string
}

/** One row from GET /audit (issue #99). Display fields are built by ember-api. */
export interface AuditEntry {
  id: string
  at: string
  actorId: string
  actorName: string
  action: string
  targetId: string
  target: string
  detail: string
  incidentId: string | null
}

export interface AuditPage {
  items: AuditEntry[]
  nextCursor: string | null
}

export interface AuditQuery {
  targetId?: string
  cursor?: string
  limit?: number
}

/**
 * The ember-api operations the supervisor console uses.
 * Withdrawal clearing is supervisor-only, with a required reason and an all-safe check.
 */
export interface SupervisorApi {
  listIncidents(): Promise<Incident[]>
  getIncident(id: string): Promise<IncidentDetail>
  /** Every task waiting for a decision, across all incidents. Supervisor only. */
  listProposedTasks(): Promise<ProposedTask[]>
  /** Volunteers near a fire who asked to join it and wait for an answer, oldest first. Supervisor only. */
  listJoinRequests(): Promise<PendingJoinRequest[]>
  /** Adds the volunteer: sends them a first instruction and links them to the incident. `409` once answered or extinguished. */
  approveJoinRequest(id: string, instruction: string): Promise<JoinDecision>
  declineJoinRequest(id: string): Promise<JoinDecision>
  /** Append-only log. Newest first. Optional targetId and cursor for paging. */
  listAudit(query?: AuditQuery): Promise<AuditPage>
  approveTask(id: string): Promise<TaskDecision>
  rejectTask(id: string): Promise<TaskDecision>
  editTask(id: string, instruction: string): Promise<TaskDecision>
  /** Sends a sent, unheard instruction again. Records another attempt and an audit entry. `409` once it was heard. */
  resendTask(id: string): Promise<TaskDecision>
  verifyIncident(id: string): Promise<IncidentDecision>
  /** Immediate. No approval step: the route sets the incident withdraw and one approved task per volunteer. */
  withdrawIncident(id: string, request: WithdrawRequest): Promise<IncidentDecision>
  /** Records that a supervisor found a withdrawn volunteer safe. Audited. It never clears the withdraw. */
  markWithdrawSafe(id: string, volunteerId: string, sessionId?: string): Promise<IncidentDecision>
  clearWithdraw(id: string, reason: string, sessionId?: string): Promise<IncidentDecision>
  requestWithdrawHelp(id: string, volunteerId: string, helperId: string, instruction: string, sessionId?: string): Promise<TaskDecision>
  /**
   * Sends one free-text instruction to one volunteer, now. Creates an `instruct` task, pushes it and writes an audit row.
   * `409` for an extinguished incident, or a volunteer under an active withdraw who is not marked safe.
   */
  sendInstruction(id: string, volunteerId: string, instruction: string): Promise<TaskDecision>
  /** A short-lived signed URL to read one photo report of the incident. `404` when there is none. */
  getPhotoUrl(id: string, observationId: string): Promise<PhotoUrl>
  /** A short-lived signed URL to read one video report of the incident. `404` when there is none. */
  getVideoUrl(id: string, observationId: string): Promise<VideoUrl>
  /** Stores a strictly lower severity. An active withdraw stays in effect. Only code can raise severity. */
  lowerSeverity(id: string, severity: LowerableSeverity): Promise<IncidentDecision>
  /** Human only, and the console cannot undo it. `409` when the incident is already extinguished. */
  extinguishIncident(id: string): Promise<IncidentDecision>
  /** Makes fresh suggestions from the stored facts and stores them for the incident. `502` or `503` when agents or the model is not available. */
  suggestIncident(id: string): Promise<DetailSuggestions>
  /** Answers a question from the stored facts, optionally about one volunteer. Advisory text. `502` or `503` when not available. */
  askIncident(id: string, question: string, volunteerId?: string): Promise<AskAnswer>
  /** Translates one report's text into English and stores it. `502` or `503` when not available. */
  translateObservation(id: string, observationId: string): Promise<Translation>
  /** Hold the free live seat for a volunteer with 3G or better (#102). */
  makeLive(incidentId: string, volunteerId: string): Promise<LiveSeatDecision>
  /** Retry live for a dropped volunteer when signal is 3G or better (#102). */
  retryLive(incidentId: string, volunteerId: string): Promise<LiveSeatDecision>
}

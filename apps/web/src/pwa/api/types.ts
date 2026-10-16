import type { DeclineReason, Digest, DigestPosition, FlagRequest, IncidentDetail, IncidentMembership, Observation, ObservationRequest, PhotoContentType, UploadUrl, WithdrawAnswerRequest } from '../contracts/types'

/** Error surfaced to the UI. `retryable` is true for network failures, 429 and 5xx. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
    readonly fields: Record<string, string> = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** The ember-api operations the volunteer PWA uses. */
export interface EmberApi {
  /** GET /digest. Pass the phone position when known so `nearby` can be filled (#134). */
  getDigest(position?: DigestPosition | null): Promise<Digest>
  /** GET /incidents/{id}: one incident this volunteer is on. A volunteer who is not on it gets `not_found` (404). */
  getIncident(incidentId: string): Promise<IncidentDetail>
  createObservation(body: ObservationRequest): Promise<Observation>
  /** POST /photos/upload-url: a signed PUT URL for one photo in the private bucket. */
  createUploadUrl(contentType: PhotoContentType): Promise<UploadUrl>
  /** POST /tasks/{id}/heard: this phone showed the task. Sets `heardAt` once; a repeat changes nothing. */
  markTaskHeard(taskId: string): Promise<void>
  /** POST /tasks/{id}/accept: Doing it. Recorded once; a repeat changes nothing. */
  acceptTask(taskId: string): Promise<void>
  /** POST /tasks/{id}/decline: Can't do it, with a reason key and an optional note. The instruction is not changed. */
  declineTask(taskId: string, reason: DeclineReason, note?: string): Promise<void>
  /** POST /incidents/{id}/withdraw/answer: safe upwind, or can't get out. The latest answer replaces the earlier one. */
  answerWithdraw(incidentId: string, answer: WithdrawAnswerRequest): Promise<void>
  /** POST /observations/{id}/flag: someone else's report looks wrong. The report is not changed. */
  flagObservation(observationId: string, flag: FlagRequest): Promise<void>
  /** POST /incidents/{id}/join: Join now with no approval (#134). */
  joinIncident(incidentId: string): Promise<IncidentMembership>
  /** POST /incidents/{id}/en-route: I'm on my way (#135). Persists across reload. */
  markEnRoute(incidentId: string): Promise<IncidentMembership>
}

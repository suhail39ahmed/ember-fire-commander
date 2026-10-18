import type { DeclineReason, Digest, DigestOptions, DigestPosition, FlagRequest, IncidentDetail, IncidentMembership, JoinRequestSummary, Observation, ObservationRequest, PhotoContentType, PracticeResponse, TrainingPayload, UploadUrl, VideoContentType, VideoUploadUrl, WithdrawAnswerRequest } from '../contracts/types'

import type { Me, MePatch } from '../../auth/api'
import type { PracticeRequest, PracticeAnswer } from '../contracts/types'

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
  patchMe(body: MePatch): Promise<Me>
  /** GET /digest. With the phone's position the answer also lists live incidents near it (`nearby`). The position is not stored. */
  getDigest(position?: DigestPosition | null, options?: DigestOptions): Promise<Digest>
  /** POST /incidents/{id}/join-requests: ask a supervisor to add this volunteer to a fire. A repeat returns the first request. */
  requestJoin(incidentId: string): Promise<JoinRequestSummary>
  /** GET /incidents/{id}: one incident this volunteer is on. A volunteer who is not on it gets `not_found` (404). */
  getIncident(incidentId: string): Promise<IncidentDetail>
  createObservation(body: ObservationRequest): Promise<Observation>
  completeTask?(taskId: string, body: { clientId: string; observations: ObservationRequest[] }): Promise<void>
  /** POST /photos/upload-url: a signed PUT URL for one photo in the private bucket. */
  createUploadUrl(contentType: PhotoContentType): Promise<UploadUrl>
  /** POST /videos/upload-url: a signed PUT URL for one video clip in the private bucket. */
  createVideoUploadUrl(contentType: VideoContentType): Promise<VideoUploadUrl>
  /** POST /tasks/{id}/heard: this phone showed the task. Sets `heardAt` once; a repeat changes nothing. */
  markTaskHeard(taskId: string): Promise<void>
  /** POST /tasks/{id}/accept: Doing it. Recorded once; a repeat changes nothing. */
  acceptTask(taskId: string, response?: 'on_my_way' | 'starting_now' | null, note?: string): Promise<void>
  /** POST /tasks/{id}/decline: Can't do it, with a reason key and an optional note. The instruction is not changed. */
  declineTask(taskId: string, reason: DeclineReason, note?: string): Promise<void>
  /** POST /incidents/{id}/withdraw/answer: safe upwind, or can't get out. The latest answer replaces the earlier one. */
  shareWithdrawLocation?(incidentId: string, location: Omit<WithdrawAnswerRequest, 'state'>): Promise<void>
  answerWithdraw(incidentId: string, answer: WithdrawAnswerRequest): Promise<void>
  /** POST /observations/{id}/flag: someone else's report looks wrong. The report is not changed. */
  flagObservation(observationId: string, flag: FlagRequest): Promise<void>
  /** POST /incidents/{id}/join: Join now with no approval (#134). */
  joinIncident(incidentId: string): Promise<IncidentMembership>
  /** POST /incidents/{id}/en-route: I'm on my way (#135). Persists across reload. */
  markEnRoute(incidentId: string): Promise<IncidentMembership>
  /** GET /training: Guide lessons and progress (#153). */
  getTraining(): Promise<TrainingPayload>
  /** POST /training/progress: save video/lesson progress (#153). */
  saveTrainingProgress(body: { videoProgressSec?: number; lessonId?: string; status?: string; score?: number; total?: number }): Promise<void>
  /** POST /training/practice: practice chat that cannot create observations (#154). */
  askPractice(body: PracticeRequest): Promise<PracticeResponse>
  answerPractice(turnId: string, optionId: string): Promise<PracticeAnswer>
  /** POST /voice/ticket: issue a 60-second single-use ticket for the browser WebSocket handshake (§7, §6.14). */
  requestVoiceTicket(): Promise<{ ticket: string; expiresAt: string }>
}

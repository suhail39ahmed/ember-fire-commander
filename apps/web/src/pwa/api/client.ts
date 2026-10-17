/**
 * ember-api client for the volunteer PWA.
 * The browser talks only to ember-api (REST, here) and voice-gateway (WebSocket,
 * see ../gateway/). No Firestore or Cloud Storage SDK is used in the browser.
 * The one exception is the photo PUT to a signed URL that ember-api issued (see ../photo/).
 */
import type { DeclineReason, Digest, DigestOptions, DigestPosition, ErrorBody, FlagRequest, IncidentDetail, IncidentMembership, JoinRequestSummary, Observation, ObservationRequest, PracticeResponse, TrainingPayload, UploadUrl, WithdrawAnswerRequest } from '../contracts/types'
import type { AuthHeadersProvider } from './authHeaders'
import type { PracticeAnswer } from '../contracts/types'
import { API_BASE_URL } from './config'
import { ApiError, type EmberApi } from './types'

export const ENDPOINTS = {
  me: '/me',
  digest: '/digest',
  // About 1 m of precision is plenty for "how far is that fire", and keeps the URL free of exponent forms.
  digestAt: (position: DigestPosition) => `/digest?lat=${position.lat.toFixed(5)}&lng=${position.lng.toFixed(5)}`,
  joinRequest: (incidentId: string) => `/incidents/${encodeURIComponent(incidentId)}/join-requests`,
  incident: (incidentId: string) => `/incidents/${encodeURIComponent(incidentId)}`,
  join: (incidentId: string) => `/incidents/${encodeURIComponent(incidentId)}/join`,
  enRoute: (incidentId: string) => `/incidents/${encodeURIComponent(incidentId)}/en-route`,
  observations: '/observations',
  photoUploadUrl: '/photos/upload-url',
  accept: (taskId: string) => `/tasks/${encodeURIComponent(taskId)}/accept`,
  decline: (taskId: string) => `/tasks/${encodeURIComponent(taskId)}/decline`,
  withdrawAnswer: (incidentId: string) => `/incidents/${encodeURIComponent(incidentId)}/withdraw/answer`,
  flag: (observationId: string) => `/observations/${encodeURIComponent(observationId)}/flag`,
  heard: (taskId: string) => `/tasks/${encodeURIComponent(taskId)}/heard`,
  training: '/training',
  trainingProgress: '/training/progress',
  practice: '/training/practice',
} as const

function digestPath(position?: DigestPosition | null, options?: DigestOptions): string {
  const q = new URLSearchParams()
  if (position) {
    q.set('lat', position.lat.toFixed(5))
    q.set('lng', position.lng.toFixed(5))
  }
  // URLSearchParams encodes the "+" of a zone offset, so the server reads it back as a plus.
  if (options?.sentSince) q.set('sentSince', options.sentSince)
  const query = q.toString()
  return query ? `${ENDPOINTS.digest}?${query}` : ENDPOINTS.digest
}

function isErrorBody(body: unknown): body is ErrorBody {
  const error = (body as ErrorBody | null)?.error
  return typeof error === 'object' && error !== null && typeof error.code === 'string'
}

export function createHttpApi(
  getAuthHeaders: AuthHeadersProvider,
  baseUrl: string = API_BASE_URL,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): EmberApi {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const auth = await getAuthHeaders()
    if (!auth) throw new ApiError('unauthorized', 'Not signed in', 401, false)
    const headers: Record<string, string> = { Accept: 'application/json', ...auth }
    if (init.body) headers['Content-Type'] = 'application/json'
    let res: Response
    try {
      res = await fetchImpl(`${baseUrl}${path}`, { ...init, headers })
    } catch {
      throw new ApiError('network', 'Network error', null, true)
    }
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null)
      const retryable = res.status >= 500 || res.status === 429
      if (isErrorBody(body)) {
        throw new ApiError(body.error.code, body.error.message, res.status, retryable, body.error.fields ?? {})
      }
      throw new ApiError(retryable ? 'unavailable' : 'http_error', `HTTP ${res.status}`, res.status, retryable)
    }
    return (await res.json()) as T
  }

  return {
    patchMe: (body) => request(ENDPOINTS.me, { method: 'PATCH', body: JSON.stringify(body) }),
    getDigest: (position, options) => request<Digest>(digestPath(position, options)),
    requestJoin: async (incidentId) => {
      const body = await request<{ joinRequest: JoinRequestSummary }>(ENDPOINTS.joinRequest(incidentId), { method: 'POST' })
      const { incidentId: id, status, createdAt } = body.joinRequest
      return { incidentId: id, status, createdAt }
    },
    getIncident: (incidentId) => request<IncidentDetail>(ENDPOINTS.incident(incidentId)),
    createObservation: (body: ObservationRequest) =>
      request<Observation>(ENDPOINTS.observations, { method: 'POST', body: JSON.stringify(body) }),
    createUploadUrl: (contentType) =>
      request<UploadUrl>(ENDPOINTS.photoUploadUrl, { method: 'POST', body: JSON.stringify({ contentType }) }),
    markTaskHeard: async (taskId) => {
      await request<unknown>(ENDPOINTS.heard(taskId), { method: 'POST' })
    },
    acceptTask: async (taskId) => {
      await request<unknown>(ENDPOINTS.accept(taskId), { method: 'POST' })
    },
    declineTask: async (taskId: string, reason: DeclineReason, note?: string) => {
      await request<unknown>(ENDPOINTS.decline(taskId), { method: 'POST', body: JSON.stringify({ reason, note: note?.trim() ? note.trim() : null }) })
    },
    shareWithdrawLocation: async (incidentId, location) => {
      await request<unknown>(`${ENDPOINTS.withdrawAnswer(incidentId).replace('/answer', '/location')}`, { method: 'POST', body: JSON.stringify(location) })
    },
    answerWithdraw: async (incidentId: string, answer: WithdrawAnswerRequest) => {
      await request<unknown>(ENDPOINTS.withdrawAnswer(incidentId), { method: 'POST', body: JSON.stringify(answer) })
    },
    flagObservation: async (observationId: string, flag: FlagRequest) => {
      await request<unknown>(ENDPOINTS.flag(observationId), { method: 'POST', body: JSON.stringify({ reason: flag.reason, photoPath: flag.photoPath ?? null }) })
    },
    joinIncident: async (incidentId) => {
      const body = await request<{ membership: IncidentMembership }>(ENDPOINTS.join(incidentId), { method: 'POST' })
      return body.membership
    },
    markEnRoute: async (incidentId) => {
      const body = await request<{ membership: IncidentMembership }>(ENDPOINTS.enRoute(incidentId), { method: 'POST' })
      return body.membership
    },
    getTraining: () => request<TrainingPayload>(ENDPOINTS.training),
    saveTrainingProgress: async (body) => {
      await request<unknown>(ENDPOINTS.trainingProgress, { method: 'POST', body: JSON.stringify(body) })
    },
    askPractice: (body) => request<PracticeResponse>(ENDPOINTS.practice, { method: 'POST', body: JSON.stringify(body) }),
    answerPractice: (turnId, optionId) => request<PracticeAnswer>(`${ENDPOINTS.practice}/${encodeURIComponent(turnId)}/answer`, { method: 'POST', body: JSON.stringify({ optionId }) }),
  }
}

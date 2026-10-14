/**
 * ember-api client for the volunteer PWA.
 * The browser talks only to ember-api (REST, here) and voice-gateway (WebSocket,
 * see ../gateway/). No Firestore or Cloud Storage SDK is used in the browser.
 * The one exception is the photo PUT to a signed URL that ember-api issued (see ../photo/).
 */
import type { Digest, ErrorBody, Observation, ObservationRequest, UploadUrl } from '../contracts/types'
import type { AuthHeadersProvider } from './authHeaders'
import { API_BASE_URL } from './config'
import { ApiError, type EmberApi } from './types'

export const ENDPOINTS = {
  digest: '/digest',
  observations: '/observations',
  photoUploadUrl: '/photos/upload-url',
} as const

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
    getDigest: () => request<Digest>(ENDPOINTS.digest),
    createObservation: (body: ObservationRequest) =>
      request<Observation>(ENDPOINTS.observations, { method: 'POST', body: JSON.stringify(body) }),
    createUploadUrl: (contentType) =>
      request<UploadUrl>(ENDPOINTS.photoUploadUrl, { method: 'POST', body: JSON.stringify({ contentType }) }),
  }
}

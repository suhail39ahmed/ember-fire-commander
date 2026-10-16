/**
 * ember-api client for the supervisor console (contract sections 6.3 and 6.5).
 * Same transport and error mapping as the volunteer client.
 */
import type { ErrorBody } from '../../pwa/contracts/types'
import type { AuthHeadersProvider } from '../../pwa/api/authHeaders'
import { API_BASE_URL } from '../../pwa/api/config'
import { ApiError } from '../../pwa/api/types'
import type { Incident, IncidentDecision, IncidentDetail, LowerableSeverity, TaskDecision, WithdrawRequest } from '../contracts'
import type { SupervisorApi } from './types'

export const SUPERVISOR_ENDPOINTS = {
  incidents: '/incidents',
  incident: (id: string) => `/incidents/${encodeURIComponent(id)}`,
  verify: (id: string) => `/incidents/${encodeURIComponent(id)}/verify`,
  withdraw: (id: string) => `/incidents/${encodeURIComponent(id)}/withdraw`,
  severity: (id: string) => `/incidents/${encodeURIComponent(id)}/severity`,
  extinguish: (id: string) => `/incidents/${encodeURIComponent(id)}/extinguish`,
  approve: (id: string) => `/tasks/${encodeURIComponent(id)}/approve`,
  reject: (id: string) => `/tasks/${encodeURIComponent(id)}/reject`,
  edit: (id: string) => `/tasks/${encodeURIComponent(id)}/edit`,
} as const

function isErrorBody(body: unknown): body is ErrorBody {
  const error = (body as ErrorBody | null)?.error
  return typeof error === 'object' && error !== null && typeof error.code === 'string'
}

export function createHttpSupervisorApi(
  getAuthHeaders: AuthHeadersProvider,
  baseUrl: string = API_BASE_URL,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): SupervisorApi {
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

  const post = <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

  return {
    listIncidents: () => request<Incident[]>(SUPERVISOR_ENDPOINTS.incidents),
    getIncident: (id) => request<IncidentDetail>(SUPERVISOR_ENDPOINTS.incident(id)),
    approveTask: (id) => post<TaskDecision>(SUPERVISOR_ENDPOINTS.approve(id)),
    rejectTask: (id) => post<TaskDecision>(SUPERVISOR_ENDPOINTS.reject(id)),
    editTask: (id, instruction) => post<TaskDecision>(SUPERVISOR_ENDPOINTS.edit(id), { instruction }),
    verifyIncident: (id) => post<IncidentDecision>(SUPERVISOR_ENDPOINTS.verify(id)),
    withdrawIncident: (id, request: WithdrawRequest) => post<IncidentDecision>(SUPERVISOR_ENDPOINTS.withdraw(id), request),
    lowerSeverity: (id, severity: LowerableSeverity) => post<IncidentDecision>(SUPERVISOR_ENDPOINTS.severity(id), { severity }),
    extinguishIncident: (id) => post<IncidentDecision>(SUPERVISOR_ENDPOINTS.extinguish(id)),
  }
}

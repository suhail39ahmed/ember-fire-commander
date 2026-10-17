/**
 * ember-api client for the supervisor console (contract sections 6.3 and 6.5).
 * Same transport and error mapping as the volunteer client.
 */
import type { ErrorBody } from '../../pwa/contracts/types'
import type { AuthHeadersProvider } from '../../pwa/api/authHeaders'
import { API_BASE_URL } from '../../pwa/api/config'
import { ApiError } from '../../pwa/api/types'
import type { Incident, IncidentDecision, IncidentDetail, JoinDecision, LowerableSeverity, PendingJoinRequest, PhotoUrl, ProposedTask, TaskDecision, WithdrawRequest } from '../contracts'
import type { AuditPage, AuditQuery, LiveSeatDecision, SupervisorApi } from './types'

export const SUPERVISOR_ENDPOINTS = {
  incidents: '/incidents',
  proposedTasks: '/tasks?status=proposed',
  joinRequests: '/join-requests?status=pending',
  joinApprove: (id: string) => `/join-requests/${encodeURIComponent(id)}/approve`,
  joinDecline: (id: string) => `/join-requests/${encodeURIComponent(id)}/decline`,
  incident: (id: string) => `/incidents/${encodeURIComponent(id)}`,
  audit: '/audit',
  verify: (id: string) => `/incidents/${encodeURIComponent(id)}/verify`,
  withdraw: (id: string) => `/incidents/${encodeURIComponent(id)}/withdraw`,
  withdrawSafe: (id: string) => `/incidents/${encodeURIComponent(id)}/withdraw/safe`,
  instruct: (id: string, volunteerId: string) => `/incidents/${encodeURIComponent(id)}/volunteers/${encodeURIComponent(volunteerId)}/instruct`,
  photo: (id: string, observationId: string) => `/incidents/${encodeURIComponent(id)}/photos/${encodeURIComponent(observationId)}`,
  severity: (id: string) => `/incidents/${encodeURIComponent(id)}/severity`,
  extinguish: (id: string) => `/incidents/${encodeURIComponent(id)}/extinguish`,
  makeLive: (id: string) => `/incidents/${encodeURIComponent(id)}/live/make-live`,
  retryLive: (id: string) => `/incidents/${encodeURIComponent(id)}/live/retry`,
  approve: (id: string) => `/tasks/${encodeURIComponent(id)}/approve`,
  reject: (id: string) => `/tasks/${encodeURIComponent(id)}/reject`,
  resend: (id: string) => `/tasks/${encodeURIComponent(id)}/resend`,
  edit: (id: string) => `/tasks/${encodeURIComponent(id)}/edit`,
} as const

function auditQuery(query: AuditQuery = {}): string {
  const params = new URLSearchParams()
  if (query.targetId) params.set('targetId', query.targetId)
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit != null) params.set('limit', String(query.limit))
  const text = params.toString()
  return text ? `${SUPERVISOR_ENDPOINTS.audit}?${text}` : SUPERVISOR_ENDPOINTS.audit
}

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
    listProposedTasks: () => request<ProposedTask[]>(SUPERVISOR_ENDPOINTS.proposedTasks),
    listJoinRequests: () => request<PendingJoinRequest[]>(SUPERVISOR_ENDPOINTS.joinRequests),
    approveJoinRequest: (id, instruction) => post<JoinDecision>(SUPERVISOR_ENDPOINTS.joinApprove(id), { instruction }),
    declineJoinRequest: (id) => post<JoinDecision>(SUPERVISOR_ENDPOINTS.joinDecline(id)),
    listAudit: (query) => request<AuditPage>(auditQuery(query)),
    approveTask: (id) => post<TaskDecision>(SUPERVISOR_ENDPOINTS.approve(id)),
    rejectTask: (id) => post<TaskDecision>(SUPERVISOR_ENDPOINTS.reject(id)),
    editTask: (id, instruction) => post<TaskDecision>(SUPERVISOR_ENDPOINTS.edit(id), { instruction }),
    resendTask: (id) => post<TaskDecision>(SUPERVISOR_ENDPOINTS.resend(id)),
    verifyIncident: (id) => post<IncidentDecision>(SUPERVISOR_ENDPOINTS.verify(id)),
    withdrawIncident: (id, request: WithdrawRequest) => post<IncidentDecision>(SUPERVISOR_ENDPOINTS.withdraw(id), request),
    markWithdrawSafe: (id, volunteerId) => post<IncidentDecision>(SUPERVISOR_ENDPOINTS.withdrawSafe(id), { volunteerId }),
    sendInstruction: (id, volunteerId, instruction) => post<TaskDecision>(SUPERVISOR_ENDPOINTS.instruct(id, volunteerId), { instruction }),
    getPhotoUrl: (id, observationId) => request<PhotoUrl>(SUPERVISOR_ENDPOINTS.photo(id, observationId)),
    lowerSeverity: (id, severity: LowerableSeverity) => post<IncidentDecision>(SUPERVISOR_ENDPOINTS.severity(id), { severity }),
    extinguishIncident: (id) => post<IncidentDecision>(SUPERVISOR_ENDPOINTS.extinguish(id)),
    makeLive: (id, volunteerId) => post<LiveSeatDecision>(SUPERVISOR_ENDPOINTS.makeLive(id), { volunteerId }),
    retryLive: (id, volunteerId) => post<LiveSeatDecision>(SUPERVISOR_ENDPOINTS.retryLive(id), { volunteerId }),
  }
}

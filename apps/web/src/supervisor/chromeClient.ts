/**
 * GET /dashboard — the chrome fields of the supervisor dashboard read.
 * Issue #91 adds the rest of that response. This client does not load incidents.
 */
import type { ErrorBody } from '../pwa/contracts/types'
import type { AuthHeadersProvider } from '../pwa/api/authHeaders'
import { API_BASE_URL } from '../pwa/api/config'
import { ApiError } from '../pwa/api/types'

export interface ConsoleChrome {
  agency: string | null
  serverTime: string
  approvalsCount: number
}

/** Design fixture used only when VITE_USE_MOCK_API=true. Not a live task count. */
export function mockConsoleChrome(now = new Date()): ConsoleChrome {
  return {
    agency: 'BPBD Kepulauan Meranti',
    serverTime: now.toISOString(),
    approvalsCount: 3,
  }
}

function isChrome(body: unknown): body is ConsoleChrome {
  if (typeof body !== 'object' || body === null) return false
  const value = body as Partial<ConsoleChrome>
  const agencyOk = value.agency === null || typeof value.agency === 'string'
  return agencyOk
    && typeof value.serverTime === 'string'
    && typeof value.approvalsCount === 'number'
    && Number.isFinite(value.approvalsCount)
}

function isErrorBody(body: unknown): body is ErrorBody {
  const error = (body as ErrorBody | null)?.error
  return typeof error === 'object' && error !== null && typeof error.code === 'string'
}

export async function fetchConsoleChrome(
  getAuthHeaders: AuthHeadersProvider,
  baseUrl: string = API_BASE_URL,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<ConsoleChrome> {
  const auth = await getAuthHeaders()
  if (!auth) throw new ApiError('unauthorized', 'Not signed in', 401, false)
  const headers: Record<string, string> = { Accept: 'application/json', ...auth }
  let res: Response
  try {
    res = await fetchImpl(`${baseUrl}/dashboard`, { headers })
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
  const body: unknown = await res.json()
  if (!isChrome(body)) {
    throw new ApiError('http_error', 'Dashboard response is missing chrome fields', res.status, false)
  }
  return body
}

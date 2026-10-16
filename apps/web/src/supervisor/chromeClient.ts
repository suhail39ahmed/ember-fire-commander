/**
 * GET /dashboard — chrome fields, the live-fire banner, season impact, and charts.
 */
import type { ErrorBody } from '../pwa/contracts/types'
import type { AuthHeadersProvider } from '../pwa/api/authHeaders'
import { API_BASE_URL } from '../pwa/api/config'
import { ApiError } from '../pwa/api/types'

/** One live fire on the banner. Null fields have no stored source. */
export interface LiveFire {
  id: string
  peopleOnSite: number
  withdrawActive: boolean
  code: string | null
  placeName: string | null
  liveCameras: number | null
  photoCadence: string | null
  distanceToRisk: string | null
  since: string | null
}

/** Season-impact slots. Null until a stored source exists. */
export interface SeasonImpact {
  since: string | null
  region: string | null
  crewCount: number | null
  firesContained: number | null
  firesContainedNote: string | null
  falseAlarmsCleared: number | null
  falseAlarmsNote: string | null
  injuries: number | null
  injuriesNote: string | null
  medianTimeToHumanCheck: string | null
  medianTimeNote: string | null
  reignitionsCaught: number | null
  reignitionsNote: string | null
}

export const emptySeasonImpact = (): SeasonImpact => ({
  since: null,
  region: null,
  crewCount: null,
  firesContained: null,
  firesContainedNote: null,
  falseAlarmsCleared: null,
  falseAlarmsNote: null,
  injuries: null,
  injuriesNote: null,
  medianTimeToHumanCheck: null,
  medianTimeNote: null,
  reignitionsCaught: null,
  reignitionsNote: null,
})

export interface DashboardCharts {
  satelliteNote: string | null
  realFires: number | null
  dismissed: number | null
  medianNote: string | null
  medianToday: string | null
  medianTarget: string | null
  crewNote: string | null
  onSite: number | null
  enRoute: number | null
  ready: number | null
  offline: number | null
  weatherNote: string | null
  airTempC: number | null
  humidity: string | null
  wind: string | null
  rain: string | null
}

export const emptyCharts = (): DashboardCharts => ({
  satelliteNote: null,
  realFires: null,
  dismissed: null,
  medianNote: null,
  medianToday: null,
  medianTarget: null,
  crewNote: null,
  onSite: null,
  enRoute: null,
  ready: null,
  offline: null,
  weatherNote: null,
  airTempC: null,
  humidity: null,
  wind: null,
  rain: null,
})

export interface ConsoleChrome {
  agency: string | null
  serverTime: string
  approvalsCount: number
  updatedAt?: string
  nextSatellitePass?: string | null
  liveFires?: LiveFire[]
  seasonImpact?: SeasonImpact
  charts?: DashboardCharts
}

/** Design fixture used only when VITE_USE_MOCK_API=true. Not a live task count. */
export function mockConsoleChrome(now = new Date()): ConsoleChrome {
  return {
    agency: 'BPBD Kepulauan Meranti',
    serverTime: now.toISOString(),
    approvalsCount: 3,
    updatedAt: now.toISOString(),
    nextSatellitePass: null,
    liveFires: [],
    seasonImpact: emptySeasonImpact(),
    charts: emptyCharts(),
  }
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string'
}

function isLiveFire(value: unknown): value is LiveFire {
  if (typeof value !== 'object' || value === null) return false
  const fire = value as Partial<LiveFire>
  return typeof fire.id === 'string'
    && typeof fire.peopleOnSite === 'number'
    && Number.isFinite(fire.peopleOnSite)
    && typeof fire.withdrawActive === 'boolean'
    && isNullableString(fire.code)
    && isNullableString(fire.placeName)
    && (fire.liveCameras === null || typeof fire.liveCameras === 'number')
    && isNullableString(fire.photoCadence)
    && isNullableString(fire.distanceToRisk)
    && isNullableString(fire.since)
}

function isNullOrNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isSeasonImpact(value: unknown): value is SeasonImpact {
  if (typeof value !== 'object' || value === null) return false
  const impact = value as Partial<SeasonImpact>
  return isNullableString(impact.since)
    && isNullableString(impact.region)
    && isNullOrNumber(impact.crewCount)
    && isNullOrNumber(impact.firesContained)
    && isNullableString(impact.firesContainedNote)
    && isNullOrNumber(impact.falseAlarmsCleared)
    && isNullableString(impact.falseAlarmsNote)
    && isNullOrNumber(impact.injuries)
    && isNullableString(impact.injuriesNote)
    && isNullableString(impact.medianTimeToHumanCheck)
    && isNullableString(impact.medianTimeNote)
    && isNullOrNumber(impact.reignitionsCaught)
    && isNullableString(impact.reignitionsNote)
}

function isCharts(value: unknown): value is DashboardCharts {
  if (typeof value !== 'object' || value === null) return false
  const charts = value as Partial<DashboardCharts>
  return isNullableString(charts.satelliteNote)
    && isNullOrNumber(charts.realFires)
    && isNullOrNumber(charts.dismissed)
    && isNullableString(charts.medianNote)
    && isNullableString(charts.medianToday)
    && isNullableString(charts.medianTarget)
    && isNullableString(charts.crewNote)
    && isNullOrNumber(charts.onSite)
    && isNullOrNumber(charts.enRoute)
    && isNullOrNumber(charts.ready)
    && isNullOrNumber(charts.offline)
    && isNullableString(charts.weatherNote)
    && isNullOrNumber(charts.airTempC)
    && isNullableString(charts.humidity)
    && isNullableString(charts.wind)
    && isNullableString(charts.rain)
}

function isChrome(body: unknown): body is ConsoleChrome {
  if (typeof body !== 'object' || body === null) return false
  const value = body as Partial<ConsoleChrome>
  const agencyOk = value.agency === null || typeof value.agency === 'string'
  const firesOk = value.liveFires === undefined || (Array.isArray(value.liveFires) && value.liveFires.every(isLiveFire))
  const passOk = value.nextSatellitePass === undefined || isNullableString(value.nextSatellitePass)
  const updatedOk = value.updatedAt === undefined || typeof value.updatedAt === 'string'
  const seasonOk = value.seasonImpact === undefined || isSeasonImpact(value.seasonImpact)
  const chartsOk = value.charts === undefined || isCharts(value.charts)
  return agencyOk
    && typeof value.serverTime === 'string'
    && typeof value.approvalsCount === 'number'
    && Number.isFinite(value.approvalsCount)
    && firesOk
    && passOk
    && updatedOk
    && seasonOk
    && chartsOk
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

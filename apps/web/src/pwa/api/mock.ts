/**
 * Mock ember-api for local development (VITE_USE_MOCK_API=true).
 * Synthetic data only, matching docs/demo/scenario.md. Fictional people and places.
 *
 * Task and WITHDRAW state is produced here, standing in for backend code.
 * The UI only displays what the API returns.
 */
import { CHIP_VALUES, type Digest, type IncidentDetail, type JoinRequestSummary, type NearbyIncident, type Observation, type ObservationRequest } from '../contracts/types'
import { bearingDeg, distanceM } from '../screens/geo'
import { ApiError, type EmberApi } from './types'

export interface MockControls {
  /** Simulate the backend safety rule firing (code WITHDRAW). */
  triggerWithdraw(): void
  /** Simulate the withdraw leaving the digest (nothing in the real API does this yet). */
  clearWithdraw(): void
  /** Simulate a supervisor approving or declining this volunteer's join request for a nearby fire. */
  approveJoin(incidentId: string): void
  declineJoin(incidentId: string): void
  /** Make the next createObservation call fail. */
  failNext(kind: 'network' | 'validation'): void
  reset(): void
  readonly observations: readonly Observation[]
}

const INCIDENT_ID = 'inc_demo_01'
const INCIDENT_NAME = 'Ketapang, Kalimantan Barat · Pak Dedi · #1'
const WITHDRAW_TEXT = 'MUNDUR sekarang ke titik kumpul di arah datangnya angin. Jangan padamkan sendiri.'

function validationError(field: string, hint: string): ApiError {
  return new ApiError('validation_error', `${field} is not valid`, 400, false, { [field]: hint })
}

const MOCK_PHOTO_PREFIX = 'photos/'

/** Two fires a few hundred metres from wherever the phone is, so the nearby list shows on any desktop or phone. */
const NEARBY_FIXTURES = [
  { id: 'inc_near_01', name: 'Ketapang, Kalimantan Barat · Sari · #2', area: 'Ketapang, Kalimantan Barat', severity: 'small_flame', north: 0.0035, east: 0.0012, crewOnSite: 3, reporterName: 'Sari' },
  { id: 'inc_near_02', name: 'Ketapang, Kalimantan Barat · Rizal · #3', area: 'Ketapang, Kalimantan Barat', severity: 'smoke', north: -0.012, east: 0.02, crewOnSite: 4, reporterName: 'Rizal' },
] as const

function validate(body: ObservationRequest, volunteerId: string): void {
  if (body.source !== 'chip' && body.source !== 'text' && body.source !== 'photo') throw validationError('source', 'use chip, text or photo')
  if (typeof body.lat !== 'number' || body.lat < -90 || body.lat > 90) throw validationError('lat', 'required, -90 to 90')
  if (typeof body.lng !== 'number' || body.lng < -180 || body.lng > 180) throw validationError('lng', 'required, -180 to 180')
  if (!body.capturedAt) throw validationError('capturedAt', 'required')
  if (body.source === 'chip' && (body.chip === null || !CHIP_VALUES.includes(body.chip))) {
    throw validationError('chip', 'use asap, api, aman, or butuh_bantuan')
  }
  if (body.source === 'text' && !body.text?.trim()) throw validationError('text', 'required for a text report')
  if (body.source === 'photo' && !body.photoPath?.startsWith(`${MOCK_PHOTO_PREFIX}${volunteerId}/`)) {
    throw validationError('photoPath', 'use the photoPath from your own upload')
  }
}

const SEVERITY = { asap: 'smoke', api: 'small_flame', aman: 'none', butuh_bantuan: 'unknown' } as const

export function createMockApi(volunteerId: string, latencyMs = 300): EmberApi & { mock: MockControls } {
  let digest: Digest
  let failure: 'network' | 'validation' | null = null
  const observations: Observation[] = []
  const joinRequests: JoinRequestSummary[] = []
  /** The last phone position sent with a digest read. Nearby fires sit relative to it, so an approved one must too. */
  let lastPosition: { lat: number; lng: number } | null = null

  const reset = () => {
    digest = {
      updatedAt: new Date().toISOString(),
      incidents: [{ id: INCIDENT_ID, name: INCIDENT_NAME, area: 'Ketapang, Kalimantan Barat', status: 'open', severity: 'small_flame', withdraw: null, lat: -1.849, lng: 110.051 }],
      myTasks: [
        {
          id: 'task_demo_verify',
          incidentId: INCIDENT_ID,
          volunteerId,
          type: 'verify',
          status: 'approved',
          instruction: 'Foto lebih lebar ke arah tanah. Jaga jarak aman. Katakan apakah api terlihat.',
        },
      ],
    }
    failure = null
    observations.length = 0
    joinRequests.length = 0
  }
  reset()

  const wait = () => new Promise((r) => setTimeout(r, latencyMs))

  const nearbyFor = (position: { lat: number; lng: number }): NearbyIncident[] =>
    NEARBY_FIXTURES.map((f) => {
      const lat = position.lat + f.north
      const lng = position.lng + f.east
      return {
        id: f.id,
        name: f.name,
        area: f.area,
        status: 'open' as const,
        severity: f.severity,
        withdraw: null,
        lat,
        lng,
        distanceM: Math.round(distanceM(position, { lat, lng })),
        bearingDeg: Math.round(bearingDeg(position, { lat, lng })) % 360,
        crewOnSite: f.crewOnSite,
        reporterName: f.reporterName,
      }
    })
      .filter((i) => !digest.incidents.some((mine) => mine.id === i.id))
      .sort((a, b) => a.distanceM - b.distanceM)

  return {
    async getDigest(position) {
      await wait()
      if (position) lastPosition = position
      return { ...structuredClone(digest), nearby: position ? nearbyFor(position) : [], myJoinRequests: structuredClone(joinRequests) }
    },
    async requestJoin(incidentId) {
      await wait()
      const existing = joinRequests.find((r) => r.incidentId === incidentId)
      if (existing) return { ...existing }
      const created: JoinRequestSummary = { incidentId, status: 'pending', createdAt: new Date().toISOString() }
      joinRequests.push(created)
      return { ...created }
    },
    async getIncident(incidentId) {
      await wait()
      const incident = digest.incidents.find((i) => i.id === incidentId)
      if (!incident) throw new ApiError('not_found', 'incident id is unknown', 404, false)
      const detail: IncidentDetail = {
        incident: { ...incident, evidenceScore: null, conflictId: null },
        observations: structuredClone(observations),
        conflict: null,
        tasks: structuredClone(digest.myTasks.filter((t) => t.incidentId === incidentId)),
      }
      return detail
    },
    async createObservation(body) {
      await wait()
      if (failure) {
        const f = failure
        failure = null
        if (f === 'network') throw new ApiError('network', 'Network error', null, true)
        throw validationError('chip', 'use asap, api, aman, or butuh_bantuan')
      }
      validate(body, volunteerId)
      const stored: Observation = {
        ...body,
        id: `obs_mock_${observations.length + 1}`,
        volunteerId,
        receivedAt: new Date().toISOString(),
        severity: body.chip ? SEVERITY[body.chip] : 'unknown',
        photoPath: body.source === 'photo' ? body.photoPath : null,
        immutable: true,
      }
      observations.push(stored)
      return stored
    },
    async markTaskHeard(taskId) {
      await wait()
      const task = digest.myTasks.find((t) => t.id === taskId)
      if (!task) throw new ApiError('not_found', 'task id is unknown', 404, false)
      if (task.status !== 'approved') throw new ApiError('conflict', 'Only a sent instruction can be heard', 409, false)
      task.heardAt ??= new Date().toISOString()
    },
    async acceptTask(taskId) {
      await wait()
      const task = digest.myTasks.find((t) => t.id === taskId)
      if (!task) throw new ApiError('not_found', 'task id is unknown', 404, false)
      task.acceptedAt ??= new Date().toISOString()
    },
    async declineTask(taskId, reason, note) {
      await wait()
      const task = digest.myTasks.find((t) => t.id === taskId)
      if (!task) throw new ApiError('not_found', 'task id is unknown', 404, false)
      if (!task.declinedAt) Object.assign(task, { declinedAt: new Date().toISOString(), declineReason: reason, declineNote: note?.trim() || null })
    },
    async answerWithdraw(incidentId) {
      await wait()
      if (!digest.incidents.some((i) => i.id === incidentId && i.withdraw?.active)) throw new ApiError('conflict', 'There is no active withdraw on this incident', 409, false)
    },
    async flagObservation(observationId) {
      await wait()
      const mine = observations.find((o) => o.id === observationId)
      if (!mine) throw new ApiError('not_found', 'observation id is unknown', 404, false)
      if (mine.volunteerId === volunteerId) throw new ApiError('conflict', 'You cannot flag your own report', 409, false)
    },
    async createUploadUrl(contentType) {
      await wait()
      const id = Math.random().toString(16).slice(2).padEnd(12, '0')
      const ext = contentType === 'image/webp' ? 'webp' : 'jpg'
      return {
        uploadUrl: `mock-upload://${id}`,
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        photoPath: `${MOCK_PHOTO_PREFIX}${volunteerId}/mock/${id}.${ext}`,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      }
    },
    mock: {
      triggerWithdraw() {
        digest = {
          updatedAt: new Date().toISOString(),
          incidents: digest.incidents.map((i) => ({
            ...i,
            withdraw: { active: true, instruction: WITHDRAW_TEXT, reasons: ['large flame reported'], volunteerIds: [volunteerId], source: 'code', sentAt: new Date().toISOString(), safeVolunteerIds: [] },
          })),
          myTasks: [
            ...digest.myTasks,
            { id: 'task_demo_withdraw', incidentId: INCIDENT_ID, volunteerId, type: 'withdraw', status: 'approved', instruction: WITHDRAW_TEXT },
          ],
        }
      },
      clearWithdraw() {
        digest = {
          updatedAt: new Date().toISOString(),
          incidents: digest.incidents.map((i) => ({ ...i, withdraw: null })),
          myTasks: digest.myTasks.filter((x) => x.type !== 'withdraw'),
        }
      },
      approveJoin(incidentId) {
        const fixture = NEARBY_FIXTURES.find((f) => f.id === incidentId)
        const request = joinRequests.find((r) => r.incidentId === incidentId)
        if (!fixture || !request) return
        request.status = 'approved'
        digest = {
          ...digest,
          updatedAt: new Date().toISOString(),
          incidents: [...digest.incidents, { id: fixture.id, name: fixture.name, area: fixture.area, status: 'open', severity: fixture.severity, withdraw: null, lat: (lastPosition?.lat ?? -1.849) + fixture.north, lng: (lastPosition?.lng ?? 110.051) + fixture.east }],
          myTasks: [
            ...digest.myTasks,
            { id: `task_join_${fixture.id}`, incidentId: fixture.id, volunteerId, type: 'instruct', status: 'approved', instruction: 'Bantu di titik kumpul utara. Bawa air.', sentAt: new Date().toISOString() },
          ],
        }
      },
      declineJoin(incidentId) {
        const request = joinRequests.find((r) => r.incidentId === incidentId)
        if (request) request.status = 'declined'
      },
      failNext(kind) {
        failure = kind
      },
      reset,
      get observations() {
        return observations
      },
    },
  }
}

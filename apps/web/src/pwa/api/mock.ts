/**
 * Mock ember-api for local development (VITE_USE_MOCK_API=true).
 * Synthetic data only, matching docs/demo/scenario.md. Fictional people and places.
 *
 * Task and WITHDRAW state is produced here, standing in for backend code.
 * The UI only displays what the API returns.
 */
import {
  CHIP_VALUES,
  type Digest,
  type IncidentDetail,
  type IncidentMembership,
  type NearbyIncident,
  type Observation,
  type ObservationRequest,
  type PracticeResponse,
  type TrainingPayload,
} from '../contracts/types'
import { ApiError, type EmberApi } from './types'
import { bearingDeg, distanceM } from '../screens/geo'

export interface MockControls {
  /** Simulate the backend safety rule firing (code WITHDRAW). */
  triggerWithdraw(): void
  /** Simulate the withdraw leaving the digest (nothing in the real API does this yet). */
  clearWithdraw(): void
  /** Simulate supervisor verify closing open verify tasks (#140). */
  closeLead(): void
  /** Make the next createObservation call fail. */
  failNext(kind: 'network' | 'validation'): void
  reset(): void
  readonly observations: readonly Observation[]
}

const INCIDENT_ID = 'inc_demo_01'
const INCIDENT_NAME = 'Ketapang, Kalimantan Barat · Pak Dedi · #1'
const NEARBY_ID = 'inc_demo_near'
const WITHDRAW_TEXT = 'MUNDUR sekarang ke titik kumpul di arah datangnya angin. Jangan padamkan sendiri.'

const NEARBY_BASE: NearbyIncident = {
  id: NEARBY_ID,
  name: 'TOHOR-3 · Peat field behind SDN 2',
  area: 'Peat field behind SDN 2',
  status: 'open',
  severity: 'small_flame',
  withdraw: null,
  lat: -1.84,
  lng: 110.06,
  distanceM: 1400,
  bearingDeg: 45,
  crewOnSite: 4,
  ask: null,
}

function validationError(field: string, hint: string): ApiError {
  return new ApiError('validation_error', `${field} is not valid`, 400, false, { [field]: hint })
}

const MOCK_PHOTO_PREFIX = 'photos/'

const mockTraining: TrainingPayload = {
  video: {
    id: 'how_ember_works',
    title: { id: 'Cara EMBER bekerja', en: 'How EMBER works: report, stay upwind, withdraw' },
    durationSec: 180,
    url: null,
    progressSec: 80,
  },
  lessons: [
    {
      id: 'report_30s',
      title: { id: 'Lapor dalam 30 detik', en: 'Report a fire in 30 seconds' },
      minutes: 4,
      summary: { id: 'Chip atau mic', en: 'Chip or mic' },
      body: { id: 'Latihan lapor.', en: 'Practice reporting.' },
      status: 'done',
      score: 3,
    },
    {
      id: 'wind_upwind',
      title: { id: 'Baca angin', en: 'Read the wind, stay upwind' },
      minutes: 4,
      summary: { id: 'Dari sisi angin', en: 'From upwind' },
      body: { id: 'Latihan angin.', en: 'Practice wind.' },
      status: 'done',
      score: 3,
    },
    {
      id: 'withdraw',
      title: { id: 'Kapan WITHDRAW', en: 'When to WITHDRAW' },
      minutes: 4,
      summary: { id: 'Mundur jika tidak aman', en: 'Leave when unsafe' },
      body: { id: 'Latihan mundur.', en: 'Practice withdraw.' },
      status: 'not_started',
      score: null,
    },
    {
      id: 'peat_return',
      title: { id: 'Api gambut kembali', en: 'Peat fires come back' },
      minutes: 4,
      summary: { id: 'Situs lama', en: 'Old site' },
      body: { id: 'Latihan gambut.', en: 'Practice peat.' },
      status: 'not_started',
      score: null,
    },
  ],
  doneCount: 2,
  lessonCount: 4,
  askChips: [
    { id: 'thick_smoke', label: { id: 'Asap semakin tebal', en: 'Smoke is getting thick' } },
    { id: 'wind_changed', label: { id: 'Angin berubah', en: 'The wind changed' } },
  ],
  safetyLines: [{ id: 'Jaga jarak aman.', en: 'Keep a safe distance.' }],
}

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
  const memberships = new Map<string, IncidentMembership>()
  let nearbyAvailable = true

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
      nearby: [],
      seasonStats: { checksDone: 1, falseAlarmsCleared: 0 },
    }
    failure = null
    observations.length = 0
    memberships.clear()
    nearbyAvailable = true
    mockTraining.video.progressSec = 80
    mockTraining.lessons.forEach((lesson, i) => {
      lesson.status = i < 2 ? 'done' : 'not_started'
      lesson.score = i < 2 ? 3 : null
    })
    mockTraining.doneCount = 2
  }
  reset()

  const wait = () => new Promise((r) => setTimeout(r, latencyMs))

  return {
    async getDigest(position) {
      await wait()
      const next = structuredClone(digest)
      if (position && nearbyAvailable && !digest.incidents.some((i) => i.id === NEARBY_ID)) {
        const distance = distanceM(position, { lat: NEARBY_BASE.lat, lng: NEARBY_BASE.lng })
        next.nearby = [{
          ...NEARBY_BASE,
          distanceM: Math.round(distance),
          bearingDeg: Math.round(bearingDeg(position, { lat: NEARBY_BASE.lat, lng: NEARBY_BASE.lng })),
        }]
      } else {
        next.nearby = []
      }
      return next
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
        membership: memberships.get(incidentId) ?? null,
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
    async joinIncident(incidentId) {
      await wait()
      const existing = memberships.get(incidentId)
      if (existing) return structuredClone(existing)
      if (incidentId !== NEARBY_ID && !digest.incidents.some((i) => i.id === incidentId)) {
        throw new ApiError('not_found', 'incident id is unknown', 404, false)
      }
      const membership: IncidentMembership = {
        incidentId,
        volunteerId,
        joinedAt: new Date().toISOString(),
        addedBy: volunteerId,
        addedByName: 'Pak Dedi',
        teamRole: null,
        enRouteAt: null,
        destination: null,
        approach: null,
        meetPoint: null,
        meetPerson: null,
        meetNote: null,
      }
      memberships.set(incidentId, membership)
      nearbyAvailable = false
      if (!digest.incidents.some((i) => i.id === incidentId)) {
        // Only the mock nearby fire is joinable when it is not already in incidents.
        const source = incidentId === NEARBY_ID ? NEARBY_BASE : null
        if (!source) throw new ApiError('not_found', 'incident id is unknown', 404, false)
        digest = {
          ...digest,
          updatedAt: new Date().toISOString(),
          incidents: [...digest.incidents, {
            id: incidentId,
            name: source.name,
            area: source.area,
            status: 'open',
            severity: source.severity,
            withdraw: null,
            lat: source.lat,
            lng: source.lng,
          }],
          nearby: [],
        }
      }
      return structuredClone(membership)
    },
    async markEnRoute(incidentId) {
      await wait()
      let membership = memberships.get(incidentId)
      if (!membership) {
        if (!digest.incidents.some((i) => i.id === incidentId)) throw new ApiError('not_found', 'incident id is unknown', 404, false)
        membership = {
          incidentId,
          volunteerId,
          joinedAt: new Date().toISOString(),
          addedBy: volunteerId,
          addedByName: 'Pak Dedi',
          teamRole: null,
          enRouteAt: null,
          destination: null,
          approach: null,
          meetPoint: null,
          meetPerson: null,
          meetNote: null,
        }
      }
      membership.enRouteAt ??= new Date().toISOString()
      memberships.set(incidentId, membership)
      return structuredClone(membership)
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
    async getTraining() {
      await wait()
      return structuredClone(mockTraining)
    },
    async saveTrainingProgress(body) {
      await wait()
      if (typeof body.videoProgressSec === 'number') mockTraining.video.progressSec = body.videoProgressSec
      if (body.lessonId) {
        const lesson = mockTraining.lessons.find((row) => row.id === body.lessonId)
        if (lesson && body.status) {
          lesson.status = body.status as typeof lesson.status
          if (body.score != null) lesson.score = body.score
        }
      }
      mockTraining.doneCount = mockTraining.lessons.filter((row) => row.status === 'done').length
    },
    async practiceTurn(body) {
      await wait()
      const reply = {
        id: 'Laporkan dari jarak aman dan tunggu instruksi.',
        en: 'Report from a safe distance and wait for an instruction.',
      }
      const response: PracticeResponse = {
        practice: true,
        reply,
        correct: body.optionId ? body.optionId === 'report' || body.optionId === 'upwind' || body.optionId === 'withdraw' : null,
        check: body.optionId
          ? null
          : {
              question: { id: 'Apa yang Anda lakukan dulu?', en: 'What do you do first?' },
              options: [
                { id: 'report', label: { id: 'Laporkan dari jarak aman', en: 'Report from a safe distance' } },
                { id: 'run_in', label: { id: 'Masuk ke api', en: 'Run into the fire' } },
              ],
              lessonId: body.lessonId || 'report_30s',
            },
        safetyLines: [
          { id: 'Jangan masuk ke api besar sendirian.', en: 'Do not walk into a large fire alone.' },
          { id: 'Datang dari sisi datang angin.', en: 'Approach from upwind.' },
        ],
      }
      return response
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
          nearby: digest.nearby ?? [],
          seasonStats: digest.seasonStats,
        }
      },
      clearWithdraw() {
        digest = {
          updatedAt: new Date().toISOString(),
          incidents: digest.incidents.map((i) => ({ ...i, withdraw: null })),
          myTasks: digest.myTasks.filter((x) => x.type !== 'withdraw'),
          nearby: digest.nearby ?? [],
          seasonStats: digest.seasonStats,
        }
      },
      /** Close open verify tasks so Home shows the thank-you (#140). */
      closeLead() {
        const closedAt = new Date().toISOString()
        digest = {
          updatedAt: closedAt,
          incidents: digest.incidents.map((i) => (i.id === INCIDENT_ID ? { ...i, status: 'verified' } : i)),
          myTasks: digest.myTasks.map((row) =>
            row.type === 'verify' && !row.closedAt
              ? {
                  ...row,
                  closedAt,
                  closedBy: 'uid_supervisor',
                  closedByName: 'Bu Maya',
                  closeMessage: 'False alarm cleared. Nobody else has to walk out there.',
                }
              : row,
          ),
          nearby: digest.nearby ?? [],
          seasonStats: {
            checksDone: digest.myTasks.filter((row) => row.type === 'verify').length,
            falseAlarmsCleared: digest.myTasks.filter((row) => row.type === 'verify').length,
          },
        }
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

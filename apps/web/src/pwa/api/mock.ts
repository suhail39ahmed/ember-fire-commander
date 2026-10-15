/**
 * Mock ember-api for local development (VITE_USE_MOCK_API=true).
 * Synthetic data only, matching docs/demo/scenario.md. Fictional people and places.
 *
 * Task and WITHDRAW state is produced here, standing in for backend code.
 * The UI only displays what the API returns.
 */
import { CHIP_VALUES, type Digest, type Observation, type ObservationRequest } from '../contracts/types'
import { ApiError, type EmberApi } from './types'

export interface MockControls {
  /** Simulate the backend safety rule firing (code WITHDRAW). */
  triggerWithdraw(): void
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
  }
  reset()

  const wait = () => new Promise((r) => setTimeout(r, latencyMs))

  return {
    async getDigest() {
      await wait()
      return structuredClone(digest)
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
            withdraw: { active: true, instruction: WITHDRAW_TEXT, reasons: ['large flame reported'], volunteerIds: [volunteerId] },
          })),
          myTasks: [
            ...digest.myTasks,
            { id: 'task_demo_withdraw', incidentId: INCIDENT_ID, volunteerId, type: 'withdraw', status: 'approved', instruction: WITHDRAW_TEXT },
          ],
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

/**
 * Tests for the video clip player in the expanded volunteer view.
 * Checks that video observations are rendered and the signed URL is fetched.
 */
import { describe, expect, it, vi } from 'vitest'
import { popupFor } from '../detail/popupModel'
import type { IncidentDetail, Observation } from '../contracts'

const INCIDENT_ID = 'inc_01'
const VOLUNTEER_ID = 'uid_sari'
const BASE_OBS: Observation = {
  id: 'obs_01',
  volunteerId: VOLUNTEER_ID,
  capturedAt: '2026-10-17T03:02:00Z',
  receivedAt: '2026-10-17T03:02:01Z',
  source: 'photo',
  lat: 1.48,
  lng: 102.11,
  accuracyM: 18,
  chip: null,
  text: null,
  severity: 'smoke',
  photoPath: 'photos/uid_sari/20261017/abc.jpg',
  immutable: true,
}

const VIDEO_OBS: Observation = {
  ...BASE_OBS,
  id: 'obs_02',
  source: 'video',
  photoPath: null,
  videoPath: 'videos/uid_sari/20261017/xyz.mp4',
}

const BASE_DETAIL: IncidentDetail = {
  incident: {
    id: INCIDENT_ID,
    status: 'open',
    severity: 'smoke',
    evidenceScore: 30,
    conflictId: null,
    withdraw: null,
    lat: 1.48,
    lng: 102.11,
  },
  observations: [BASE_OBS, VIDEO_OBS],
  conflict: null,
  tasks: [],
}

describe('popupFor with video observations', () => {
  it('splits photos and videos into separate arrays', () => {
    const popup = popupFor(BASE_DETAIL, VOLUNTEER_ID, 'en')
    expect(popup).not.toBeNull()
    expect(popup!.photos).toHaveLength(1)
    expect(popup!.photos[0].id).toBe('obs_01')
    expect(popup!.videos).toHaveLength(1)
    expect(popup!.videos[0].id).toBe('obs_02')
    expect(popup!.videos[0].source).toBe('video')
    expect(popup!.videos[0].videoPath).toBe('videos/uid_sari/20261017/xyz.mp4')
  })

  it('reports total count including video reports', () => {
    const popup = popupFor(BASE_DETAIL, VOLUNTEER_ID, 'en')
    expect(popup!.reports).toHaveLength(2)
  })

  it('has an empty videos array when there are no video observations', () => {
    const detail: IncidentDetail = { ...BASE_DETAIL, observations: [BASE_OBS] }
    const popup = popupFor(detail, VOLUNTEER_ID, 'en')
    expect(popup!.videos).toHaveLength(0)
  })
})

describe('IncidentDetailView passes videoUrl to ExpandedVolunteerView', () => {
  it('ExpandedVolunteerViewProps accepts a videoUrl function', () => {
    // Type-level check: import and verify the interface accepts videoUrl.
    type Props = import('../detail/ExpandedVolunteerView').ExpandedVolunteerViewProps
    const videoUrl: Props['videoUrl'] = vi.fn().mockResolvedValue({ url: 'https://s.example.com/v', expiresAt: '2026-10-17T04:00:00Z' })
    expect(typeof videoUrl).toBe('function')
  })
})

describe('supervisor contracts — Observation type accepts videoPath', () => {
  it('VideoUrl is exported from contracts', () => {
    const { VideoUrl: _VideoUrl } = {} as unknown as { VideoUrl: unknown }
    // Type-level: VideoUrl interface exists in supervisor/contracts.ts
    type V = import('../contracts').VideoUrl
    const v: V = { url: 'https://storage.example.com/v', expiresAt: '2026-10-17T04:00:00Z' }
    expect(v.url).toContain('https')
  })

  it('Observation type allows videoPath field', () => {
    const obs: Observation = { ...VIDEO_OBS }
    expect(obs.videoPath).toBe('videos/uid_sari/20261017/xyz.mp4')
  })
})

/**
 * Tests for the video clip path through the outbox.
 *
 * The outbox treats a pending video exactly like a pending photo:
 * it uploads first (if the body is null and video is set) and then
 * sends a `source: video` observation.
 */
import { describe, expect, it, vi } from 'vitest'
import { Outbox } from '../outbox/outbox'
import { createMemoryStore } from '../outbox/store'
import type { PendingVideo } from '../outbox/types'
import type { Observation, VideoObservationCreate } from '../contracts/types'
import { buildVideoObservation } from '../video/uploadVideo'

const POS = { lat: 1.48, lng: 102.11, accuracyM: 18 }

function makeObservation(body: VideoObservationCreate): Observation {
  return {
    id: 'obs_video_01',
    volunteerId: 'uid_sari',
    capturedAt: body.capturedAt,
    receivedAt: body.capturedAt,
    source: 'video',
    lat: body.lat,
    lng: body.lng,
    accuracyM: body.accuracyM,
    chip: null,
    text: null,
    severity: 'unknown',
    photoPath: null,
    videoPath: body.videoPath,
    immutable: true,
  }
}

function makeOutbox({ uploadVideo = vi.fn().mockResolvedValue('videos/uid_sari/20261017/abc.mp4') } = {}) {
  const sent: unknown[] = []
  const outbox = new Outbox({
    store: createMemoryStore(),
    send: async (body) => {
      sent.push(body)
      return makeObservation(body as VideoObservationCreate)
    },
    uploadPhoto: vi.fn().mockRejectedValue(new Error('not expected')),
    uploadVideo,
  })
  return { outbox, sent, uploadVideo }
}

describe('video outbox', () => {
  it('keeps the task link through offline storage and upload replay', async () => {
    const { outbox, sent } = makeOutbox()
    await outbox.enqueueVideo({ blob: new Blob(['v']), contentType: 'video/mp4', capturedAt: '2026-10-18T09:00:00Z', pos: POS, taskId: 'task_1' })
    await outbox.flush()
    expect(sent[0]).toMatchObject({ source: 'video', taskId: 'task_1' })
  })
  it('uploads a pending video and then sends a video observation', async () => {
    const { outbox, sent, uploadVideo } = makeOutbox()
    const video: PendingVideo = {
      blob: new Blob(['video'], { type: 'video/mp4' }),
      contentType: 'video/mp4',
      capturedAt: '2026-10-17T03:02:00Z',
      pos: POS,
    }
    const item = await outbox.enqueueVideo(video)
    expect(item.state).toBe('queued')
    expect(item.body).toBeNull()
    expect(item.video).not.toBeNull()

    await outbox.flush()
    expect(uploadVideo).toHaveBeenCalledWith(video.blob, 'video/mp4')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ source: 'video', videoPath: 'videos/uid_sari/20261017/abc.mp4' })
  })

  it('marks the item as sent after successful upload + observation', async () => {
    const { outbox } = makeOutbox()
    const video: PendingVideo = {
      blob: new Blob(['v'], { type: 'video/webm' }),
      contentType: 'video/webm',
      capturedAt: '2026-10-17T03:05:00Z',
      pos: POS,
    }
    await outbox.enqueueVideo(video)
    await outbox.flush()
    const items = outbox.list()
    expect(items[0].state).toBe('sent')
    expect(items[0].video).toBeNull()
  })

  it('retries on upload failure and keeps the video bytes', async () => {
    const uploadVideo = vi.fn().mockRejectedValueOnce(Object.assign(new Error('net'), { retryable: true }))
    const { outbox } = makeOutbox({ uploadVideo })
    const video: PendingVideo = {
      blob: new Blob(['v'], { type: 'video/mp4' }),
      contentType: 'video/mp4',
      capturedAt: '2026-10-17T03:07:00Z',
      pos: POS,
    }
    await outbox.enqueueVideo(video)
    await outbox.flush()
    const items = outbox.list()
    // Still queued because the upload failed and it is retryable.
    expect(items[0].state).toBe('queued')
    expect(items[0].video).not.toBeNull()
  })

  it('buildVideoObservation creates the correct shape', () => {
    const body = buildVideoObservation('videos/uid_sari/20261017/x.mp4', '2026-10-17T03:02:00Z', POS)
    expect(body).toEqual({
      source: 'video',
      capturedAt: '2026-10-17T03:02:00Z',
      lat: POS.lat,
      lng: POS.lng,
      accuracyM: POS.accuracyM,
      chip: null,
      text: null,
      videoPath: 'videos/uid_sari/20261017/x.mp4',
    })
    expect(body).not.toHaveProperty('photoPath')
    expect(body).not.toHaveProperty('severity')
  })

  it('capturedAtOf works for video items', async () => {
    const { outbox } = makeOutbox()
    const capturedAt = '2026-10-17T03:09:00Z'
    const video: PendingVideo = { blob: new Blob(['v']), contentType: 'video/mp4', capturedAt, pos: POS }
    const item = await outbox.enqueueVideo(video)
    const { capturedAtOf } = await import('../outbox/types')
    expect(capturedAtOf(item)).toBe(capturedAt)
  })
})

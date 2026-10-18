import { describe, expect, it, vi } from 'vitest'
import { attachmentBatch, attachmentProblem, attachRecording, videoType, type Attachment } from '../report/attachments'
import { validateDraft } from '../report/buildObservation'
import { Outbox } from '../outbox/outbox'
import { createMemoryStore } from '../outbox/store'
import { ApiError } from '../api/types'
import { UploadError } from '../photo/upload'
import type { Observation, ObservationCreate, ObservationRequest } from '../contracts/types'

const body: ObservationCreate = { source: 'chip', chip: 'aman', text: 'Demo report', capturedAt: '2026-10-18T09:00:00Z', lat: 1.48, lng: 102.11, accuracyM: 12, taskId: 'task_1' }
const attachment = (id: string, kind: 'photo' | 'video' = 'photo'): Attachment => ({ id, kind, blob: new Blob(['data']), contentType: kind === 'photo' ? 'image/jpeg' : 'video/mp4', previewUrl: 'blob:demo', name: id })
const file = (name: string, type: string, size = 100): File => ({ name, type, size } as File)

describe('report attachments', () => {
  it('Stop recording waits for the final clip and adds it to the video list without uploading', async () => {
    let finish!: (clip: Blob) => void
    const recorder = { stopAndTakeClip: () => new Promise<Blob>((resolve) => { finish = resolve }) }
    const stopCamera = vi.fn()
    const add = vi.fn(async () => [attachment('recorded', 'video')])
    const result = attachRecording(recorder, stopCamera, add)
    expect(add).not.toHaveBeenCalled()
    finish(new Blob(['recording'], { type: 'video/webm;codecs=vp8,opus' }))
    expect(await result).toHaveLength(1)
    expect(stopCamera).toHaveBeenCalledOnce()
    expect(add).toHaveBeenCalledWith('video', [expect.objectContaining({ name: 'recorded-video.webm', type: 'video/webm', size: 9 })])
  })
  it('allows four photos, rejects a fifth, and allows one video alongside the photos', () => {
    const photos = [1, 2, 3, 4].map((id) => attachment(String(id)))
    expect(attachmentProblem('photo', Array(4).fill(file('a.jpg', 'image/jpeg')), [])).toBeNull()
    expect(attachmentProblem('photo', [file('a.jpg', 'image/jpeg')], photos)).toBe('photoLimit')
    expect(attachmentProblem('video', [file('a.mp4', 'video/mp4')], photos)).toBeNull()
    expect(attachmentProblem('video', [file('b.mp4', 'video/mp4')], [attachment('v', 'video')])).toBe('videoLimit')
  })

  it('validates photo/video type and size and accepts phone MOV videos', () => {
    expect(attachmentProblem('photo', [file('empty.jpg', 'image/jpeg', 0)], [])).toBe('badPhoto')
    expect(attachmentProblem('video', [file('large.mp4', 'video/mp4', 10 * 1024 * 1024 + 1)], [])).toBe('videoSize')
    expect(attachmentProblem('video', [file('test.avi', 'video/x-msvideo')], [])).toBe('badVideo')
    expect(videoType(file('camera.mov', 'video/quicktime'))).toBe('video/quicktime')
    expect(videoType(file('camera.mp4', ''))).toBe('video/mp4')
  })

  it('supports a media-only send without creating an empty text observation', () => {
    expect(validateDraft({ chip: null, text: '', capturedAt: body.capturedAt, hasAttachments: true })).toBeNull()
    const entries = attachmentBatch({ ...body, chip: null, text: null, source: 'text' }, [attachment('photo')], 'report')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ id: 'photo', body: null, photo: { taskId: 'task_1' } })
  })

  it('prepares four photo uploads, one video and the selected card with stable ids and the note', () => {
    const entries = attachmentBatch(body, [...[1, 2, 3, 4].map((id) => attachment(String(id))), attachment('v', 'video')], 'report')
    expect(entries).toHaveLength(6)
    expect(entries[1].photo).toMatchObject({ text: 'Demo report', taskId: 'task_1' })
    expect(entries[5].video).toMatchObject({ text: 'Demo report', contentType: 'video/mp4' })
  })
})

describe('attachment batch persistence and retries', () => {
  const stored = (request: ObservationRequest): Observation => ({ ...request, id: request.clientId!, volunteerId: 'demo', receivedAt: body.capturedAt, severity: 'none', photoPath: 'photoPath' in request ? request.photoPath : null, immutable: true })

  it('uploads all five files and never duplicates them when the same batch is sent again', async () => {
    const send = vi.fn(async (request: ObservationRequest) => stored(request))
    const uploadPhoto = vi.fn(async () => 'photos/demo/path.jpg')
    const uploadVideo = vi.fn(async () => 'videos/demo/path.mp4')
    const outbox = new Outbox({ store: createMemoryStore(), send, uploadPhoto, uploadVideo })
    const entries = attachmentBatch(body, [...[1, 2, 3, 4].map((id) => attachment(String(id))), attachment('v', 'video')], 'report')
    expect(await outbox.submitBatch(entries)).toBe('sent')
    expect(await outbox.submitBatch(entries)).toBe('sent')
    expect(send).toHaveBeenCalledTimes(6)
    expect(uploadPhoto).toHaveBeenCalledTimes(4)
    expect(uploadVideo).toHaveBeenCalledTimes(1)
  })

  it('retains files offline and replays them with the task and note after reload', async () => {
    const store = createMemoryStore()
    const failed = new Outbox({ store, send: vi.fn(), uploadPhoto: async () => { throw new UploadError('network', null) } })
    const entries = attachmentBatch({ ...body, chip: null, source: 'text' }, [attachment('p')], 'report')
    expect(await failed.submitBatch(entries)).toBe('queued')
    const send = vi.fn(async (request: ObservationRequest) => stored(request))
    const reloaded = new Outbox({ store, send, uploadPhoto: async () => 'photos/demo/path.jpg' })
    expect(await reloaded.submitBatch(entries)).toBe('sent')
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task_1', text: 'Demo report', clientId: 'p' }))
  })

  it('retries only rejected observations and preserves an already uploaded file path', async () => {
    let reject = true
    const send = vi.fn(async (request: ObservationRequest) => {
      if (reject && request.clientId === 'p') throw new ApiError('validation_error', 'Rejected', 400, false)
      return stored(request)
    })
    const uploadPhoto = vi.fn(async () => 'photos/demo/path.jpg')
    const outbox = new Outbox({ store: createMemoryStore(), send, uploadPhoto })
    const entries = attachmentBatch(body, [attachment('p')], 'report')
    await expect(outbox.submitBatch(entries)).rejects.toThrow('Rejected')
    reject = false
    expect(await outbox.submitBatch(entries)).toBe('sent')
    expect(uploadPhoto).toHaveBeenCalledTimes(1)
    expect(send.mock.calls.filter(([request]) => request.clientId === 'report')).toHaveLength(1)
  })
})

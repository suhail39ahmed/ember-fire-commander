import { describe, expect, it, vi } from 'vitest'
import { Outbox } from '../outbox/outbox'
import { createMemoryStore } from '../outbox/store'
import type { PendingTaskCompletion } from '../outbox/types'
import { UploadError } from '../photo/upload'
import { ApiError } from '../api/types'
import { assignedTasks } from '../screens/incidentsView'
import { currentTask } from '../digest'
import { answerLine } from '../../supervisor/detail/popupModel'
import { digest, task } from './volunteerKit'

const capturedAt = '2026-10-18T10:00:00Z'
const pending = { capturedAt, pos: { lat: 1, lng: 2, accuracyM: 10 }, taskId: 'task_1', text: 'Finished', blob: new Blob(['test']) }
const submission = (): PendingTaskCompletion => ({ taskId: 'task_1', capturedAt, entries: [
  { id: 'photo', body: null, video: null, photo: { ...pending, contentType: 'image/jpeg' } },
  { id: 'video', body: null, photo: null, video: { ...pending, contentType: 'video/mp4' } },
] })

describe('task completion', () => {
  it('holds completion until every file uploads, then completes once on replay after reload', async () => {
    const store = createMemoryStore()
    const send = vi.fn()
    const completeTask = vi.fn(async () => undefined)
    const uploadPhoto = vi.fn(async () => 'photos/own/photo.jpg')
    const broken = new Outbox({ store, send, completeTask, uploadPhoto, uploadVideo: async () => { throw new UploadError('network', null) } })
    expect(await broken.submitTask('submit-1', submission())).toBe('queued')
    expect(completeTask).not.toHaveBeenCalled()
    const replay = new Outbox({ store, send, completeTask, uploadPhoto, uploadVideo: async () => 'videos/own/video.mp4' })
    await replay.flush()
    expect(completeTask).toHaveBeenCalledWith('task_1', { clientId: 'submit-1', observations: [expect.objectContaining({ source: 'photo', taskId: 'task_1', text: 'Finished' }), expect.objectContaining({ source: 'video', taskId: 'task_1', text: 'Finished' })] })
    expect(await replay.submitTask('submit-1', submission())).toBe('sent')
    expect(completeTask).toHaveBeenCalledOnce()
    expect(uploadPhoto).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
  })

  it('retains uploaded references and the idempotency key after a lost completion response', async () => {
    const completeTask = vi.fn().mockRejectedValueOnce(new ApiError('network', 'offline', null, true)).mockResolvedValue(undefined)
    const uploadPhoto = vi.fn(async () => 'photos/own/photo.jpg')
    const outbox = new Outbox({ store: createMemoryStore(), send: vi.fn(), completeTask, uploadPhoto, uploadVideo: async () => 'videos/own/video.mp4' })
    expect(await outbox.submitTask('submit-2', submission())).toBe('queued')
    await outbox.flush()
    expect(outbox.list()[0].state).toBe('sent')
    expect(completeTask.mock.calls[0]).toEqual(completeTask.mock.calls[1])
    expect(uploadPhoto).toHaveBeenCalledOnce()
  })

  it('removes completed tasks from active choices and shows the result to the supervisor', () => {
    const done = task({ completedAt: capturedAt, closedAt: capturedAt, completionNote: 'Finished' })
    const data = digest({ myTasks: [done] })
    expect(currentTask(data)).toBeNull()
    expect(assignedTasks(data)).toEqual([])
    expect(answerLine('en', done, () => '10:00')).toBe('Completed 10:00 · Finished')
  })
})

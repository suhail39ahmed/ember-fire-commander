import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ObservationCreate } from '../contracts/types'
import type { Attachment } from '../report/attachments'
import type { OutboxBatchEntry } from '../outbox/types'
import type { ReportPanel } from '../report/ReportPanel'
import { ReportScreen } from '../screens/ReportScreen'
import { fakeBrowser, outboxHandle, renderVolunteer, volunteerValue } from './volunteerKit'

let panel: ComponentProps<typeof ReportPanel>
vi.mock('../report/ReportPanel', () => ({ ReportPanel: (props: ComponentProps<typeof ReportPanel>) => { panel = props; return null } }))
const media = { items: [] as Attachment[], busy: false, error: null, add: vi.fn(), clear: vi.fn(), remove: vi.fn() }
vi.mock('../report/useReportAttachments', () => ({ useReportAttachments: () => media }))
const recorder = { stopAndTakeClip: vi.fn(), discard: vi.fn(), setMicStream: vi.fn() }
const camera = { state: 'off', stream: null, recorder, recorderSnap: { recording: false, clip: null, mimeType: null, startedAt: null }, start: vi.fn(), stop: vi.fn(), toggle: vi.fn() }
vi.mock('../camera/useLiveCamera', () => ({ useLiveCamera: () => camera }))
fakeBrowser()

const body: ObservationCreate = { source: 'text', chip: null, text: 'Smoke near the canal', capturedAt: '2026-10-18T09:00:00Z', lat: 1.5, lng: 102.1, accuracyM: 10 }
const attachment = (id: string, kind: Attachment['kind']): Attachment => ({ id, kind, name: id, blob: new Blob(['data']), contentType: kind === 'photo' ? 'image/jpeg' : 'video/mp4', previewUrl: 'blob:test' })

function render(taskContext: { taskId: string; incidentId: string } | null = { taskId: 'task_1', incidentId: 'inc_1' }) {
  const submitBatch = vi.fn<[readonly OutboxBatchEntry[]], Promise<'queued' | 'sent'>>().mockResolvedValue('queued')
  const refresh = vi.fn()
  renderVolunteer(<ReportScreen taskContext={taskContext ?? undefined} />, { value: volunteerValue({ outbox: outboxHandle({ submitBatch }), refresh }) })
  return { submitBatch, refresh }
}

beforeEach(() => {
  vi.clearAllMocks()
  media.items = []
  media.busy = false
  camera.recorderSnap.recording = false
  recorder.stopAndTakeClip.mockResolvedValue(null)
})

describe('shared Report and Task media submission', () => {
  it('keeps standalone reports independent of task context', async () => {
    const { submitBatch } = render(null)
    await panel.submit!(body)
    expect(panel.taskId).toBeUndefined()
    expect(submitBatch.mock.calls[0][0][0].body).toEqual(body)
  })
  it('keeps notes and the task link on gallery photos and video in one batch', async () => {
    media.items = [attachment('p1', 'photo'), attachment('p2', 'photo'), attachment('v1', 'video')]
    const { submitBatch } = render()
    expect(panel.taskId).toBe('task_1')
    expect(panel.hasAttachments).toBe(true)
    expect(await panel.submit!(body)).toBe('queued')
    const entries = submitBatch.mock.calls[0][0]
    expect(entries).toHaveLength(3)
    expect(entries[0]).toMatchObject({ id: 'p1', photo: { taskId: 'task_1', text: body.text, pos: { lat: 1.5, lng: 102.1, accuracyM: 10 } } })
    expect(entries[1]).toMatchObject({ id: 'p2', photo: { taskId: 'task_1', text: body.text } })
    expect(entries[2]).toMatchObject({ id: 'v1', video: { taskId: 'task_1', text: body.text } })
  })

  it('supports a note without requiring photos or a video', async () => {
    const { submitBatch } = render()
    await panel.submit!(body)
    expect(submitBatch.mock.calls[0][0]).toEqual([expect.objectContaining({ body: { ...body, taskId: 'task_1' }, photo: null, video: null })])
    expect(recorder.stopAndTakeClip).not.toHaveBeenCalled()
    expect(camera.start).not.toHaveBeenCalled()
  })

  it('waits for the final recorded clip before submitting and retains the task link', async () => {
    camera.recorderSnap.recording = true
    let finish!: (blob: Blob) => void
    recorder.stopAndTakeClip.mockImplementation(() => new Promise<Blob>((resolve) => { finish = resolve }))
    const clip = attachment('recorded', 'video')
    media.add.mockResolvedValue([clip])
    const { submitBatch } = render()
    const result = panel.submit!(body)
    expect(submitBatch).not.toHaveBeenCalled()
    finish(new Blob(['clip'], { type: 'video/mp4' }))
    await result
    expect(submitBatch.mock.calls[0][0]).toEqual([expect.objectContaining({ video: expect.objectContaining({ taskId: 'task_1', text: body.text, blob: clip.blob }) })])
  })

  it('does not send an empty report when recording produces no clip', async () => {
    camera.recorderSnap.recording = true
    const { submitBatch } = render()
    await expect(panel.submit!({ ...body, text: null })).rejects.toThrow()
    expect(submitBatch).not.toHaveBeenCalled()
    expect(media.clear).not.toHaveBeenCalled()
  })

  it('reuses batch IDs on a failed send so retry does not duplicate reports', async () => {
    media.items = [attachment('p1', 'photo')]
    const { submitBatch } = render()
    submitBatch.mockRejectedValueOnce(new Error('offline storage failed'))
    const selected = { ...body, source: 'chip' as const, chip: 'asap' as const }
    await expect(panel.submit!(selected)).rejects.toThrow('offline storage failed')
    await panel.submit!(selected)
    expect(submitBatch.mock.calls[0][0]).toEqual(submitBatch.mock.calls[1][0])
    expect(media.clear).not.toHaveBeenCalled()
  })

  it('clears media and refreshes task state only after successful persistence', async () => {
    media.items = [attachment('p1', 'photo')]
    const { refresh } = render()
    await panel.submit!(body)
    expect(media.clear).not.toHaveBeenCalled()
    panel.onMediaSent!()
    expect(media.clear).toHaveBeenCalledOnce()
    expect(recorder.discard).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
  })
})

/**
 * Tests that each report-send path in ReportScreen correctly stops the
 * recording and enqueues the video clip alongside the main report.
 *
 * Pattern: mock ReportPanel and HoldToTalkPanel to capture their props,
 * then call those props to exercise the send logic without rendering a real UI.
 *
 * The recorder mock uses an async stopAndTakeClip() so tests verify that
 * the code awaits the async onstop event, not a synchronous takeClip().
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { fakeBrowser, outboxHandle, volunteerValue } from './volunteerKit'
import { VolunteerContext } from '../layout/volunteerContext'
import { LanguageProvider } from '../LanguageProvider'
import { ReportScreen } from '../screens/ReportScreen'
import type { VideoRecorderSnapshot } from '../camera/videoRecorder'
import type { ObservationCreate, ObservationRequest } from '../contracts/types'
import type { SubmitResult } from '../outbox/useOutbox'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const reportPanelProps: Array<Record<string, unknown>> = []
vi.mock('../report/ReportPanel', () => ({
  ReportPanel: (props: Record<string, unknown>) => {
    reportPanelProps.push(props)
    return null
  },
}))

const httPanelProps: Array<Record<string, unknown>> = []
vi.mock('../gateway/HoldToTalkPanel', () => ({
  HoldToTalkPanel: (props: Record<string, unknown>) => {
    httPanelProps.push(props)
    return null
  },
}))

vi.mock('../photo/PhotoPanel', () => ({ PhotoPanel: () => null }))
vi.mock('../outbox/OutboxPanel', () => ({ OutboxPanel: () => null }))
vi.mock('../gateway/CoachReply', () => ({ CoachReply: () => null, CoachReceipt: () => null }))

const recorderSnap: VideoRecorderSnapshot = { recording: false, startedAt: null, clip: null, mimeType: 'video/mp4' }
let stopAndTakeClipImpl: () => Promise<Blob | null> = async () => null
const recorder = {
  start: vi.fn(),
  stop: vi.fn(),
  takeClip: vi.fn(() => null as Blob | null),
  stopAndTakeClip: vi.fn(async () => stopAndTakeClipImpl()),
  discard: vi.fn(),
  setMicStream: vi.fn(),
  getSnapshot: vi.fn(() => recorderSnap),
  subscribe: vi.fn(() => () => undefined),
}
const camera = {
  state: 'off' as const, stream: null, recorderSnap,
  recorder, start: vi.fn(), stop: vi.fn(), toggle: vi.fn(),
}
vi.mock('../camera/useLiveCamera', () => ({ useLiveCamera: () => camera }))

fakeBrowser()

const POS = { lat: 1.48, lng: 102.11, accuracyM: 10 }
vi.mock('../report/location', () => ({
  locate: vi.fn(),
  watchLocationGranted: vi.fn(() => () => undefined),
  getPosition: vi.fn(async () => POS),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderScreen(value = volunteerValue({ outbox: outboxHandle() }), taskContext?: { taskId: string; incidentId: string }) {
  reportPanelProps.length = 0
  httPanelProps.length = 0
  renderToStaticMarkup(
    <LanguageProvider>
      <VolunteerContext.Provider value={value}>
        <StaticRouter location="/pwa/report">
          <ReportScreen taskContext={taskContext} />
        </StaticRouter>
      </VolunteerContext.Provider>
    </LanguageProvider>,
  )
  return {
    reportSubmit: reportPanelProps[0]?.submit as ((b: ObservationRequest) => Promise<SubmitResult>) | undefined,
    htt: httPanelProps[0] as { onRelease: () => void } | undefined,
  }
}

const chipBody: ObservationCreate = {
  source: 'chip', capturedAt: '2026-10-18T05:00:00Z',
  lat: POS.lat, lng: POS.lng, accuracyM: POS.accuracyM,
  chip: 'api', text: null,
}

beforeEach(() => {
  recorder.stopAndTakeClip.mockClear()
  stopAndTakeClipImpl = async () => null
  recorder.getSnapshot.mockReturnValue(recorderSnap)
})

// ---------------------------------------------------------------------------
// Chip / text Send path (submitWithVideo)
// ---------------------------------------------------------------------------

describe('chip/text Send path — submitWithVideo', () => {
  it('passes the task link to the clip upload when recording from a task', async () => {
    stopAndTakeClipImpl = async () => new Blob(['clip'], { type: 'video/mp4' })
    const submitVideo = vi.fn(async () => 'sent' as const)
    const { reportSubmit } = renderScreen(volunteerValue({ outbox: outboxHandle({ submitVideo }) }), { taskId: 'task_1', incidentId: 'inc_1' })
    await reportSubmit!(chipBody)
    expect(submitVideo).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task_1' }))
    expect(reportPanelProps[0]).toMatchObject({ taskId: 'task_1' })
  })
  it('calls stopAndTakeClip() so the clip is taken even when the camera is still recording at Send time', async () => {
    const { reportSubmit } = renderScreen()
    expect(reportSubmit).toBeDefined()
    await reportSubmit!(chipBody)
    expect(recorder.stopAndTakeClip).toHaveBeenCalledTimes(1)
  })

  it('enqueues a video observation when stopAndTakeClip resolves a blob', async () => {
    const clipBlob = new Blob(['clip'], { type: 'video/mp4' })
    stopAndTakeClipImpl = async () => clipBlob
    recorder.getSnapshot.mockReturnValue({ ...recorderSnap, mimeType: 'video/mp4' as const })

    const submitVideo = vi.fn(async () => 'sent' as const)
    const { reportSubmit } = renderScreen(volunteerValue({ outbox: outboxHandle({ submitVideo }) }))

    await reportSubmit!(chipBody)

    expect(submitVideo).toHaveBeenCalledTimes(1)
    expect(submitVideo).toHaveBeenCalledWith(expect.objectContaining({ blob: clipBlob, contentType: 'video/mp4' }))
  })

  it('does not enqueue a video when no clip was recorded', async () => {
    stopAndTakeClipImpl = async () => null
    const submitVideo = vi.fn(async () => 'sent' as const)
    const { reportSubmit } = renderScreen(volunteerValue({ outbox: outboxHandle({ submitVideo }) }))

    await reportSubmit!(chipBody)
    expect(submitVideo).not.toHaveBeenCalled()
  })

  it('falls back to queueVideo when submitVideo rejects (retryable upload failure)', async () => {
    const clipBlob = new Blob(['clip'], { type: 'video/mp4' })
    stopAndTakeClipImpl = async () => clipBlob
    recorder.getSnapshot.mockReturnValue({ ...recorderSnap, mimeType: 'video/mp4' as const })

    const submitVideo = vi.fn(async (): Promise<SubmitResult> => { throw new Error('upload failed') })
    const queueVideo = vi.fn(async () => undefined)
    const { reportSubmit } = renderScreen(volunteerValue({ outbox: outboxHandle({ submitVideo, queueVideo }) }))

    await reportSubmit!(chipBody)

    expect(submitVideo).toHaveBeenCalledTimes(1)
    expect(queueVideo).toHaveBeenCalledTimes(1)
    expect(queueVideo).toHaveBeenCalledWith(expect.objectContaining({ blob: clipBlob, contentType: 'video/mp4' }))
  })
})

// ---------------------------------------------------------------------------
// Hold to Talk release path (onRelease)
// ---------------------------------------------------------------------------

describe('Hold to Talk release path — onRelease', () => {
  it('calls stopAndTakeClip() on HtT release so the clip is taken while the camera is still recording', async () => {
    const value = volunteerValue({
      outbox: outboxHandle(),
      talk: {
        ...volunteerValue().talk,
        takeTranscript: () => 'I see smoke near the canal',
        onRelease: vi.fn(),
      },
    })
    const { htt } = renderScreen(value)
    htt!.onRelease()
    // Give async handlers time to run.
    await new Promise((r) => setTimeout(r, 0))
    expect(recorder.stopAndTakeClip).toHaveBeenCalledTimes(1)
  })

  it('enqueues a video observation alongside the HtT text report', async () => {
    const clipBlob = new Blob(['htt-clip'], { type: 'video/mp4' })
    stopAndTakeClipImpl = async () => clipBlob
    recorder.getSnapshot.mockReturnValue({ ...recorderSnap, mimeType: 'video/mp4' as const })

    const submitVideo = vi.fn(async () => 'sent' as const)
    const value = volunteerValue({
      outbox: outboxHandle({ submitVideo }),
      talk: {
        ...volunteerValue().talk,
        takeTranscript: () => 'I see smoke near the canal',
        onRelease: vi.fn(),
      },
    })
    const { htt } = renderScreen(value)
    htt!.onRelease()
    await new Promise((r) => setTimeout(r, 20))

    expect(submitVideo).toHaveBeenCalledTimes(1)
    expect(submitVideo).toHaveBeenCalledWith(expect.objectContaining({ blob: clipBlob, contentType: 'video/mp4' }))
  })

  it('does not call stopAndTakeClip when takeTranscript returns nothing (gateway had no text)', async () => {
    const value = volunteerValue({
      outbox: outboxHandle(),
      talk: {
        ...volunteerValue().talk,
        takeTranscript: () => null,
        onRelease: vi.fn(),
      },
    })
    const { htt } = renderScreen(value)
    htt!.onRelease()
    await Promise.resolve()
    // onRelease returns early (no text), so stopAndTakeClip is NOT called.
    expect(recorder.stopAndTakeClip).not.toHaveBeenCalled()
  })
})

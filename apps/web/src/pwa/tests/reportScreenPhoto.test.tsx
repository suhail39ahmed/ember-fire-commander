import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { openCapture } from '../photo/capture'
import { fakeBrowser, outboxHandle, volunteerValue } from './volunteerKit'
import { VolunteerContext } from '../layout/volunteerContext'
import { LanguageProvider } from '../LanguageProvider'
import { ReportScreen } from '../screens/ReportScreen'
import type { VideoRecorderSnapshot } from '../camera/videoRecorder'

const POS = { lat: 1.48, lng: 102.11, accuracyM: 10 }
vi.mock('../report/location', () => ({
  locate: vi.fn(),
  watchLocationGranted: vi.fn(() => () => undefined),
  getPosition: vi.fn(async () => POS),
}))

// Capture props passed to PhotoPanel so we can assert on them.
const photoProps: Array<Record<string, unknown>> = []
vi.mock('../photo/PhotoPanel', () => ({
  PhotoPanel: (props: Record<string, unknown>) => {
    photoProps.push(props)
    return null
  },
}))

const recorderSnap: VideoRecorderSnapshot = { recording: false, startedAt: null, clip: null, mimeType: null }
const recorder = {
  start: vi.fn(),
  stop: vi.fn(),
  takeClip: vi.fn(() => null),
  stopAndTakeClip: vi.fn(async () => null as Blob | null),
  discard: vi.fn(),
  setMicStream: vi.fn(),
  getSnapshot: vi.fn(() => recorderSnap),
  subscribe: vi.fn(() => () => undefined),
}
const camera = {
  state: 'on', stream: null, recorderSnap,
  recorder, start: vi.fn(), stop: vi.fn(), toggle: vi.fn(),
}
vi.mock('../camera/useLiveCamera', () => ({ useLiveCamera: () => camera }))

fakeBrowser()

function renderScreen(value = volunteerValue({ outbox: outboxHandle() })) {
  photoProps.length = 0
  renderToStaticMarkup(
    <LanguageProvider>
      <VolunteerContext.Provider value={value}>
        <StaticRouter location="/pwa/report">
          <ReportScreen />
        </StaticRouter>
      </VolunteerContext.Provider>
    </LanguageProvider>,
  )
  return photoProps[0]
}

beforeEach(() => {
  camera.stop.mockClear()
  camera.start.mockClear()
  recorder.stopAndTakeClip.mockClear()
  recorder.stopAndTakeClip.mockResolvedValue(null)
})

describe('live camera and the existing photo flow', () => {
  it('passes PhotoPanel the core props so capture, upload and report sending are correct', () => {
    const value = volunteerValue({ outbox: outboxHandle() })
    const props = renderScreen(value)
    expect(props.api).toBe(value.api)
    expect(props.upload).toBe(value.upload)
    expect(props.queuePhoto).toBe(value.outbox.queuePhoto)
    expect(props.lang).toBe('id')
    expect(typeof props.getPosition).toBe('function')
    // submit is a wrapper (not outbox.submit directly) that also enqueues the clip.
    expect(typeof props.submit).toBe('function')
  })

  it('starts clip finalisation when Take photo is used so the clip is ready when submit runs', () => {
    const props = renderScreen()
    expect(typeof props.onBeforeCapture).toBe('function')
    expect(recorder.stopAndTakeClip).not.toHaveBeenCalled()
    ;(props.onBeforeCapture as () => void)()
    expect(recorder.stopAndTakeClip).toHaveBeenCalledTimes(1)
  })

  it('enqueues the video clip through the outbox submit wrapper after the photo observation is sent', async () => {
    const clipBlob = new Blob(['clip'], { type: 'video/mp4' })
    recorder.stopAndTakeClip.mockResolvedValue(clipBlob)
    recorder.getSnapshot.mockReturnValue({ ...recorderSnap, mimeType: 'video/mp4' as const })

    const submitVideo = vi.fn(async () => 'sent' as const)
    const outbox = outboxHandle({ submitVideo })
    const value = volunteerValue({ outbox })

    const props = renderScreen(value)

    // Simulate what PhotoPanel does: onBeforeCapture then submit.
    ;(props.onBeforeCapture as () => void)()
    const photoBody = { source: 'photo' as const, capturedAt: '2026-10-18T05:00:00Z', lat: 1.5, lng: 102.1, accuracyM: 10, chip: null, text: null, photoPath: 'photos/x/y.jpg', immutable: true as const }
    await (props.submit as (body: unknown) => Promise<'sent' | 'queued'>)(photoBody)

    expect(submitVideo).toHaveBeenCalledTimes(1)
    expect(submitVideo).toHaveBeenCalledWith(expect.objectContaining({ blob: clipBlob, contentType: 'video/mp4' }))
  })

  it('does not enqueue a video when no clip was recorded during photo capture', async () => {
    recorder.stopAndTakeClip.mockResolvedValue(null)
    const submitVideo = vi.fn(async () => 'sent' as const)
    const value = volunteerValue({ outbox: outboxHandle({ submitVideo }) })

    const props = renderScreen(value)
    ;(props.onBeforeCapture as () => void)()
    await (props.submit as (body: unknown) => Promise<'sent' | 'queued'>)({ source: 'photo', capturedAt: '2026-10-18T05:00:00Z', lat: 1.5, lng: 102.1, accuracyM: 10, chip: null, text: null, photoPath: 'photos/x/y.jpg' })

    expect(submitVideo).not.toHaveBeenCalled()
  })

  it('opens the camera app or picker only after the preview let go, and still opens if the release fails', () => {
    const calls: string[] = []
    openCapture(() => calls.push('open'), () => calls.push('release'))
    expect(calls).toEqual(['release', 'open'])

    const open = vi.fn()
    expect(() =>
      openCapture(open, () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(open).toHaveBeenCalledTimes(1)

    const plain = vi.fn()
    openCapture(plain)
    expect(plain).toHaveBeenCalledTimes(1)
  })
})

describe('camera permission', () => {
  it('does not open the camera on its own when the permission is still a prompt (renders only; effects do not run)', () => {
    renderScreen()
    expect(camera.start).not.toHaveBeenCalled()
  })
})

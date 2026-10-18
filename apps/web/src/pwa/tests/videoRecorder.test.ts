import { describe, expect, it, vi, beforeEach } from 'vitest'
import { VideoRecorder, detectMimeType, MAX_RECORDING_MS, VIDEO_BITS_PER_SECOND, type VideoRecorderEnv } from '../camera/videoRecorder'

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function fakeAudioContext() {
  const destinations: { stream: MediaStream }[] = []
  const sources: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = []
  return {
    createMediaStreamDestination: vi.fn(() => {
      const dest = { stream: fakeStream().stream }
      destinations.push(dest)
      return dest
    }),
    createMediaStreamSource: vi.fn(() => {
      const src = { connect: vi.fn(), disconnect: vi.fn() }
      sources.push(src)
      return src
    }),
    close: vi.fn().mockResolvedValue(undefined),
    destinations,
    sources,
  }
}

function fakeTrack(id = 'v1'): MediaStreamTrack {
  return { id, stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaStreamTrack
}

function fakeStream(videoTracks = 1) {
  const tracks = Array.from({ length: videoTracks }, (_, i) => fakeTrack(`v${i}`))
  return {
    stream: {
      getVideoTracks: () => tracks,
      getAudioTracks: () => [],
      getTracks: () => tracks,
    } as unknown as MediaStream,
    tracks,
  }
}

function fakeMediaRecorder() {
  let ondataavailable: ((e: BlobEvent) => void) | null = null
  let onstop: (() => void) | null = null
  const recorder = {
    state: 'inactive' as 'inactive' | 'recording' | 'paused',
    start: vi.fn((timeslice?: number) => {
      void timeslice
      recorder.state = 'recording'
    }),
    stop: vi.fn(() => {
      recorder.state = 'inactive'
      // Simulate data + stop event.
      ondataavailable?.({ data: new Blob(['video'], { type: 'video/mp4' }) } as BlobEvent)
      onstop?.()
    }),
    set ondataavailable(fn: ((e: BlobEvent) => void) | null) { ondataavailable = fn },
    set onstop(fn: (() => void) | null) { onstop = fn },
    set onerror(_fn: unknown) {},
  }
  return recorder
}

type MockMediaRecorder = ReturnType<typeof fakeMediaRecorder>

function makeEnv(recorderInstance?: MockMediaRecorder): VideoRecorderEnv {
  const inst = recorderInstance ?? fakeMediaRecorder()
  const MediaRecorderCtor = vi.fn().mockReturnValue(inst) as unknown as VideoRecorderEnv['MediaRecorder']
  // isTypeSupported must live on the constructor itself.
  (MediaRecorderCtor as unknown as Record<string, unknown>).isTypeSupported = (mime: string) => mime === 'video/mp4'
  const ctxInst = fakeAudioContext()
  const AudioContextCtor = vi.fn().mockReturnValue(ctxInst) as unknown as typeof AudioContext
  const MediaStreamCtor = vi.fn((tracks: MediaStreamTrack[]) => ({ getTracks: () => tracks, getVideoTracks: () => tracks.filter((t: MediaStreamTrack) => (t as unknown as { id: string }).id.startsWith('v')) })) as unknown as typeof MediaStream
  return { MediaRecorder: MediaRecorderCtor, AudioContext: AudioContextCtor, MediaStream: MediaStreamCtor }
}

// ---------------------------------------------------------------------------
// detectMimeType
// ---------------------------------------------------------------------------

describe('detectMimeType', () => {
  it('returns null when MediaRecorder is absent', () => {
    expect(detectMimeType({})).toBeNull()
  })

  it('picks the first supported type', () => {
    const MR = { isTypeSupported: (m: string) => m === 'video/webm;codecs=vp8' } as unknown as VideoRecorderEnv['MediaRecorder']
    expect(detectMimeType({ MediaRecorder: MR })).toBe('video/webm;codecs=vp8')
  })

  it('prefers mp4 over webm when both are supported', () => {
    const MR = { isTypeSupported: () => true } as unknown as VideoRecorderEnv['MediaRecorder']
    expect(detectMimeType({ MediaRecorder: MR })).toBe('video/mp4')
  })

  it('returns null when no type is supported', () => {
    const MR = { isTypeSupported: () => false } as unknown as VideoRecorderEnv['MediaRecorder']
    expect(detectMimeType({ MediaRecorder: MR })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// VideoRecorder lifecycle
// ---------------------------------------------------------------------------

describe('VideoRecorder', () => {
  let env: VideoRecorderEnv
  let mr: MockMediaRecorder

  beforeEach(() => {
    mr = fakeMediaRecorder()
    env = makeEnv(mr)
  })

  it('starts recording when a video stream is provided', () => {
    const recorder = new VideoRecorder(env)
    const { stream } = fakeStream()
    recorder.start(stream)
    expect(mr.start).toHaveBeenCalledTimes(1)
    const snap = recorder.getSnapshot()
    expect(snap.recording).toBe(true)
    expect(snap.startedAt).toBeTypeOf('number')
    expect(snap.mimeType).toBe('video/mp4')
  })

  it('does nothing when MediaRecorder is unavailable', () => {
    const recorder = new VideoRecorder({})
    const { stream } = fakeStream()
    recorder.start(stream)
    expect(recorder.getSnapshot().recording).toBe(false)
  })

  it('silently skips when no video tracks are present', () => {
    const recorder = new VideoRecorder(env)
    const noVideo = { getVideoTracks: () => [], getTracks: () => [] } as unknown as MediaStream
    recorder.start(noVideo)
    expect(mr.start).not.toHaveBeenCalled()
    expect(recorder.getSnapshot().recording).toBe(false)
  })

  it('saves the clip after stop and takeClip returns it', () => {
    const recorder = new VideoRecorder(env)
    recorder.start(fakeStream().stream)
    recorder.stop()
    const snap = recorder.getSnapshot()
    expect(snap.recording).toBe(false)
    expect(snap.clip).toBeInstanceOf(Blob)
    const clip = recorder.takeClip()
    expect(clip).toBeInstanceOf(Blob)
    expect(recorder.getSnapshot().clip).toBeNull()
  })

  it('discard clears the clip without returning it', () => {
    const recorder = new VideoRecorder(env)
    recorder.start(fakeStream().stream)
    recorder.stop()
    expect(recorder.getSnapshot().clip).toBeInstanceOf(Blob)
    recorder.discard()
    expect(recorder.getSnapshot().clip).toBeNull()
  })

  it('does not start a second recording while one is running', () => {
    const recorder = new VideoRecorder(env)
    const { stream } = fakeStream()
    recorder.start(stream)
    recorder.start(stream)
    expect(mr.start).toHaveBeenCalledTimes(1)
  })

  it('notifies subscribers on state changes', () => {
    const recorder = new VideoRecorder(env)
    const events: boolean[] = []
    recorder.subscribe(() => events.push(recorder.getSnapshot().recording))
    recorder.start(fakeStream().stream)
    recorder.stop()
    expect(events).toContain(true)
    expect(events).toContain(false)
  })

  it('uses VIDEO_BITS_PER_SECOND and named constants are exported', () => {
    expect(VIDEO_BITS_PER_SECOND).toBe(500_000)
    expect(MAX_RECORDING_MS).toBe(60_000)
  })

  it('auto-stops after MAX_RECORDING_MS via the cap timer', () => {
    vi.useFakeTimers()
    const recorder = new VideoRecorder(env)
    recorder.start(fakeStream().stream)
    expect(recorder.getSnapshot().recording).toBe(true)
    vi.advanceTimersByTime(MAX_RECORDING_MS)
    expect(mr.stop).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('connects a mic stream to the AudioContext destination', () => {
    const recorder = new VideoRecorder(env)
    recorder.start(fakeStream().stream)
    const micTrack = fakeTrack('mic0')
    const micStream = { getAudioTracks: () => [micTrack], getTracks: () => [micTrack] } as unknown as MediaStream
    recorder.setMicStream(micStream)
    // At least one createMediaStreamSource call should have been made.
    const ctxInst = (env.AudioContext as ReturnType<typeof vi.fn>).mock.results[0].value as ReturnType<typeof fakeAudioContext>
    expect(ctxInst.createMediaStreamSource).toHaveBeenCalledWith(micStream)
  })

  it('buffers a mic stream set before start and connects it when recording begins', () => {
    const recorder = new VideoRecorder(env)
    const micStream = { getAudioTracks: () => [], getTracks: () => [] } as unknown as MediaStream
    // Set mic before start: should be buffered.
    recorder.setMicStream(micStream)
    recorder.start(fakeStream().stream)
    const ctxInst = (env.AudioContext as ReturnType<typeof vi.fn>).mock.results[0].value as ReturnType<typeof fakeAudioContext>
    expect(ctxInst.createMediaStreamSource).toHaveBeenCalledWith(micStream)
  })

  it('disconnects mic when setMicStream(null) is called', () => {
    const recorder = new VideoRecorder(env)
    recorder.start(fakeStream().stream)
    const micStream = { getAudioTracks: () => [], getTracks: () => [] } as unknown as MediaStream
    recorder.setMicStream(micStream)
    const ctxInst = (env.AudioContext as ReturnType<typeof vi.fn>).mock.results[0].value as ReturnType<typeof fakeAudioContext>
    const src = ctxInst.sources[0]
    recorder.setMicStream(null)
    expect(src.disconnect).toHaveBeenCalled()
  })

  it('takeClip returns null when no recording was done', () => {
    const recorder = new VideoRecorder(env)
    expect(recorder.takeClip()).toBeNull()
  })

  it('stop is safe to call when not recording', () => {
    const recorder = new VideoRecorder(env)
    expect(() => recorder.stop()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Async fake MediaRecorder — onstop/dataavailable fire asynchronously
// ---------------------------------------------------------------------------

/**
 * A fake MediaRecorder whose stop() does NOT fire onstop synchronously.
 * The caller receives `getFireOnStop` and calls the returned function to simulate
 * the browser delivering the onstop task. This exercises the real-browser race
 * condition where onstop is a queued task after stop() returns, not a synchronous
 * callback. (The plain fakeMediaRecorder fires onstop synchronously and would miss
 * this class of bug.)
 */
function fakeAsyncMediaRecorder() {
  let onDataAvailable: ((e: BlobEvent) => void) | null = null
  let onStop: (() => void) | null = null
  let fireOnStop: (() => void) | null = null
  let requestDataCalls = 0

  const recorder = {
    state: 'inactive' as 'inactive' | 'recording' | 'paused',
    start: vi.fn(() => { recorder.state = 'recording' }),
    stop: vi.fn(() => {
      recorder.state = 'inactive'
      fireOnStop = () => {
        onDataAvailable?.({ data: new Blob(['async-video'], { type: 'video/mp4' }) } as BlobEvent)
        onStop?.()
        fireOnStop = null
      }
    }),
    requestData: vi.fn(() => { requestDataCalls++ }),
    set ondataavailable(fn: ((e: BlobEvent) => void) | null) { onDataAvailable = fn },
    set onstop(fn: (() => void) | null) { onStop = fn },
    set onerror(_fn: unknown) {},
    getRequestDataCalls: () => requestDataCalls,
  }

  return { recorder, getFireOnStop: () => fireOnStop }
}

/** Like fakeAsyncMediaRecorder but stop() fires onstop without any data chunks. */
function fakeAsyncEmptyMediaRecorder() {
  let onStop: (() => void) | null = null
  let fireOnStop: (() => void) | null = null

  const recorder = {
    state: 'inactive' as 'inactive' | 'recording' | 'paused',
    start: vi.fn(() => { recorder.state = 'recording' }),
    stop: vi.fn(() => {
      recorder.state = 'inactive'
      fireOnStop = () => { onStop?.(); fireOnStop = null }
    }),
    requestData: vi.fn(),
    set ondataavailable(_fn: unknown) {},
    set onstop(fn: (() => void) | null) { onStop = fn },
    set onerror(_fn: unknown) {},
  }

  return { recorder, getFireOnStop: () => fireOnStop }
}

function makeAsyncEnv(asyncMr: ReturnType<typeof fakeAsyncMediaRecorder>['recorder']): VideoRecorderEnv {
  const MRCtor = vi.fn().mockReturnValue(asyncMr) as unknown as VideoRecorderEnv['MediaRecorder']
  ;(MRCtor as unknown as Record<string, unknown>).isTypeSupported = (m: string) => m === 'video/mp4'
  return { MediaRecorder: MRCtor, AudioContext: makeEnv().AudioContext, MediaStream: makeEnv().MediaStream }
}

// ---------------------------------------------------------------------------
// stopAndTakeClip — resolves after onstop fires asynchronously
// ---------------------------------------------------------------------------

describe('stopAndTakeClip', () => {
  it('resolves immediately with null when no recording was ever done', async () => {
    const recorder = new VideoRecorder(makeEnv())
    expect(await recorder.stopAndTakeClip()).toBeNull()
  })

  it('resolves immediately when a clip is already available (synchronous onstop)', async () => {
    const recorder = new VideoRecorder(makeEnv())
    recorder.start(fakeStream().stream)
    recorder.stop()
    const clip = await recorder.stopAndTakeClip()
    expect(clip).toBeInstanceOf(Blob)
    expect(recorder.getSnapshot().clip).toBeNull()
  })

  it('calls requestData() before stop() to flush buffered chunks', async () => {
    const callOrder: string[] = []
    const { recorder: asyncMr, getFireOnStop } = fakeAsyncMediaRecorder()
    // Wrap to capture order.
    const origReqData = asyncMr.requestData
    asyncMr.requestData = vi.fn(() => { callOrder.push('requestData'); origReqData() })
    const origStop = asyncMr.stop
    asyncMr.stop = vi.fn(() => { callOrder.push('stop'); origStop() })

    const recorderInst = new VideoRecorder(makeAsyncEnv(asyncMr))
    recorderInst.start(fakeStream().stream)

    const promise = recorderInst.stopAndTakeClip()
    expect(callOrder).toEqual(['requestData', 'stop'])

    getFireOnStop()!()
    await promise
  })

  it('does not call requestData() when the recorder is already in inactive state', async () => {
    const { recorder: asyncMr, getFireOnStop } = fakeAsyncMediaRecorder()
    const recorderInst = new VideoRecorder(makeAsyncEnv(asyncMr))
    recorderInst.start(fakeStream().stream)
    // Stop externally first (as useLiveCamera does).
    recorderInst.stop()

    // Now recorder.state is 'inactive'; stopAndTakeClip should not call requestData again.
    const promise = recorderInst.stopAndTakeClip()
    expect(asyncMr.requestData).not.toHaveBeenCalled()

    getFireOnStop()!()
    await promise
  })

  it('waits for onstop to fire asynchronously — the race condition case', async () => {
    const { recorder: asyncMr, getFireOnStop } = fakeAsyncMediaRecorder()
    const recorderInst = new VideoRecorder(makeAsyncEnv(asyncMr))

    recorderInst.start(fakeStream().stream)
    // Stop externally (useLiveCamera), onstop has not fired yet.
    recorderInst.stop()
    expect(recorderInst.getSnapshot().clip).toBeNull()
    expect(recorderInst.getSnapshot().recording).toBe(true)

    const promise = recorderInst.stopAndTakeClip()
    let resolved = false
    void promise.then(() => { resolved = true })

    await Promise.resolve()
    expect(resolved).toBe(false)

    getFireOnStop()!()
    const clip = await promise
    expect(clip).toBeInstanceOf(Blob)
    expect(resolved).toBe(true)
  })

  it('stops the recording and waits when called while still recording (Send while camera on)', async () => {
    const { recorder: asyncMr, getFireOnStop } = fakeAsyncMediaRecorder()
    const recorderInst = new VideoRecorder(makeAsyncEnv(asyncMr))

    recorderInst.start(fakeStream().stream)
    expect(recorderInst.getSnapshot().recording).toBe(true)

    const promise = recorderInst.stopAndTakeClip()
    expect(asyncMr.stop).toHaveBeenCalled()

    let resolved = false
    void promise.then(() => { resolved = true })
    await Promise.resolve()
    expect(resolved).toBe(false)

    getFireOnStop()!()
    const clip = await promise
    expect(clip).toBeInstanceOf(Blob)
  })

  it('resolves null when onstop fires but produces no data', async () => {
    const { recorder: asyncMr, getFireOnStop } = fakeAsyncEmptyMediaRecorder()
    const MRCtor = vi.fn().mockReturnValue(asyncMr) as unknown as VideoRecorderEnv['MediaRecorder']
    ;(MRCtor as unknown as Record<string, unknown>).isTypeSupported = (m: string) => m === 'video/mp4'
    const recorderInst = new VideoRecorder({ MediaRecorder: MRCtor, AudioContext: makeEnv().AudioContext, MediaStream: makeEnv().MediaStream })
    recorderInst.start(fakeStream().stream)

    const promise = recorderInst.stopAndTakeClip()
    getFireOnStop()!()
    expect(await promise).toBeNull()
  })

  it('resolves null after the timeout when onstop never fires', async () => {
    vi.useFakeTimers()
    const { recorder: asyncMr } = fakeAsyncMediaRecorder()
    const recorderInst = new VideoRecorder(makeAsyncEnv(asyncMr))
    recorderInst.start(fakeStream().stream)

    const promise = recorderInst.stopAndTakeClip(500)
    let resolved = false
    void promise.then(() => { resolved = true })

    await Promise.resolve()
    expect(resolved).toBe(false)

    vi.advanceTimersByTime(500)
    await Promise.resolve()
    expect(await promise).toBeNull()
    vi.useRealTimers()
  })

  it('second stopAndTakeClip returns null once the clip has been taken', async () => {
    const recorder = new VideoRecorder(makeEnv())
    recorder.start(fakeStream().stream)
    recorder.stop()
    await recorder.stopAndTakeClip()
    expect(await recorder.stopAndTakeClip()).toBeNull()
  })

  it('discard() is a no-op while stopAndTakeClip() is pending', async () => {
    const { recorder: asyncMr, getFireOnStop } = fakeAsyncMediaRecorder()
    const recorderInst = new VideoRecorder(makeAsyncEnv(asyncMr))
    recorderInst.start(fakeStream().stream)

    const promise = recorderInst.stopAndTakeClip()
    // While finalising, discard must not clear the in-flight clip.
    recorderInst.discard()

    getFireOnStop()!()
    const clip = await promise
    // The clip was not discarded; it was taken by stopAndTakeClip.
    expect(clip).toBeInstanceOf(Blob)

    // After settling, discard works normally.
    recorderInst.discard()
    expect(recorderInst.getSnapshot().clip).toBeNull()
  })
})

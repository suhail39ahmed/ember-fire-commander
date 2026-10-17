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

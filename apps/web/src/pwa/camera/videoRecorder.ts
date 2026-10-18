/**
 * Records a short video clip from the live camera stream.
 *
 * Audio mixing: when the volunteer holds Hold to Talk, the microphone stream
 * (from gateway/micCapture.ts) is mixed into the recording via an AudioContext
 * MediaStreamDestinationNode. Silence is recorded when HtT is not pressed.
 * No second microphone request is made; the same MediaStream the gateway opened
 * is shared here (browsers allow multiple consumers of one stream). The mic is
 * never opened by this class and is automatically muted in the recording once
 * HtT is released and the stream tracks end.
 *
 * Coach reply audio is NOT mixed in. The AudioPlayer sends audio to the device
 * speaker; capturing that output would require platform output-capture APIs
 * (not available cross-browser) and would place coach voice into the evidence
 * clip — not what reviewers need. Only the volunteer's own words are recorded.
 *
 * Format detection at start time (not at construction):
 *   1. video/mp4          – iOS Safari 14.5+, Chrome 105+
 *   2. video/webm;codecs=vp8 – Android Chrome, Firefox
 *   3. video/webm         – broader webm fallback
 *
 * Lifecycle:
 *   start(stream)          camera on → recording begins
 *   setMicStream(stream)   HtT press/release → mic audio mixed/muted
 *   stop()                 camera off → recording stops, clip saved
 *   takeClip()             Send report → clip returned and cleared
 *   discard()              leave screen → clip cleared without uploading
 */

/** Maximum recording length in milliseconds (one named constant). */
export const MAX_RECORDING_MS = 60_000

/** Target video bitrate (kbps × 1000). Chosen to stay under 4 MB for a 60 s clip on rural networks. */
export const VIDEO_BITS_PER_SECOND = 500_000

export type VideoMimeType = 'video/mp4' | 'video/webm;codecs=vp8' | 'video/webm'

export interface VideoRecorderEnv {
  MediaRecorder?: { new(stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder; isTypeSupported(type: string): boolean }
  AudioContext?: typeof AudioContext
  MediaStream?: typeof MediaStream
}

function browserEnv(): VideoRecorderEnv {
  if (typeof window === 'undefined') return {}
  return {
    MediaRecorder: typeof MediaRecorder !== 'undefined' ? (MediaRecorder as VideoRecorderEnv['MediaRecorder']) : undefined,
    AudioContext: typeof AudioContext !== 'undefined' ? AudioContext : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext,
    MediaStream: typeof MediaStream !== 'undefined' ? MediaStream : undefined,
  }
}

/** Detect the best supported video MIME type. Returns null when MediaRecorder is unavailable. */
export function detectMimeType(env: VideoRecorderEnv = browserEnv()): VideoMimeType | null {
  const MR = env.MediaRecorder
  if (!MR) return null
  for (const mime of ['video/mp4', 'video/webm;codecs=vp8', 'video/webm'] as VideoMimeType[]) {
    try {
      if (MR.isTypeSupported(mime)) return mime
    } catch {
      // Some environments throw on isTypeSupported for unknown types.
    }
  }
  return null
}

export interface VideoRecorderSnapshot {
  recording: boolean
  /** When recording started (Date.now()), so the UI can compute elapsed time. Null when not recording. */
  startedAt: number | null
  /** The completed clip, available between stop() and takeClip() / discard(). */
  clip: Blob | null
  mimeType: VideoMimeType | null
}

const INITIAL_SNAP: VideoRecorderSnapshot = { recording: false, startedAt: null, clip: null, mimeType: null }

export class VideoRecorder {
  private env: VideoRecorderEnv
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private ctx: AudioContext | null = null
  private destination: MediaStreamAudioDestinationNode | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private capTimer: ReturnType<typeof setTimeout> | null = null
  private snap: VideoRecorderSnapshot = INITIAL_SNAP
  private listeners = new Set<() => void>()
  /** The mic stream to connect when the AudioContext becomes available. */
  private pendingMic: MediaStream | null = null
  /**
   * True while stopAndTakeClip() is waiting for onstop. discard() is a no-op
   * during this window so that navigation cleanup cannot throw away a clip
   * that is still being flushed by the browser.
   */
  private finalizing = false

  constructor(env: VideoRecorderEnv = {}) {
    this.env = { ...browserEnv(), ...env }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): VideoRecorderSnapshot => this.snap

  private notify(patch: Partial<VideoRecorderSnapshot>) {
    this.snap = { ...this.snap, ...patch }
    this.listeners.forEach((l) => l())
  }

  /**
   * Start recording. The camera's MediaStream must already be live.
   * Silently does nothing when MediaRecorder is unsupported or a supported
   * MIME type cannot be found (recording is optional, not a hard dependency).
   */
  start(videoStream: MediaStream): void {
    if (this.recorder) return
    const MR = this.env.MediaRecorder
    const AC = this.env.AudioContext
    if (!MR || !AC) return

    const mimeType = detectMimeType(this.env)
    if (!mimeType) return

    const videoTracks = videoStream.getVideoTracks()
    if (videoTracks.length === 0) return

    this.ctx = new AC()
    this.destination = this.ctx.createMediaStreamDestination()

    const MSClass = this.env.MediaStream ?? MediaStream
    const combined = new MSClass([...videoTracks, ...this.destination.stream.getTracks()])

    // Connect any mic stream that arrived before the AudioContext was ready.
    if (this.pendingMic) {
      this._doConnect(this.pendingMic)
      this.pendingMic = null
    }

    this.chunks = []
    try {
      this.recorder = new MR(combined as MediaStream, {
        mimeType,
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      })
    } catch {
      // Constructing with specific options fails on some WebView builds.
      try {
        this.recorder = new MR(combined as MediaStream)
      } catch {
        this._closeAudio()
        return
      }
    }

    this.recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.onstop = () => {
      const blob = this.chunks.length > 0 ? new Blob(this.chunks, { type: mimeType }) : null
      this.chunks = []
      this.recorder = null
      this.notify({ recording: false, startedAt: null, clip: blob ?? this.snap.clip })
    }
    this.recorder.onerror = () => {
      this.chunks = []
      this.recorder = null
      this._closeAudio()
      this.notify({ recording: false, startedAt: null })
    }

    this.recorder.start(1000)
    this.capTimer = setTimeout(() => this.stop(), MAX_RECORDING_MS)
    this.notify({ recording: true, startedAt: Date.now(), mimeType })
  }

  /**
   * Connect or disconnect the microphone stream from Hold to Talk.
   * Call with the live MediaStream when HtT goes active; null to mute.
   * Safe to call before start() — the stream is buffered and applied when
   * recording begins.
   */
  setMicStream(stream: MediaStream | null): void {
    if (!this.ctx || !this.destination) {
      // Not recording yet; remember so start() can apply it.
      this.pendingMic = stream
      return
    }
    if (stream) {
      this._doConnect(stream)
    } else {
      this._doDisconnect()
    }
  }

  private _doConnect(stream: MediaStream): void {
    if (!this.ctx || !this.destination) return
    this._doDisconnect()
    try {
      this.micSource = this.ctx.createMediaStreamSource(stream)
      this.micSource.connect(this.destination)
    } catch {
      this.micSource = null
    }
  }

  private _doDisconnect(): void {
    if (this.micSource) {
      try { this.micSource.disconnect() } catch { /* already disconnected */ }
      this.micSource = null
    }
  }

  /** Stop recording (e.g. camera turned off). The clip is saved and can be taken with takeClip(). */
  stop(): void {
    this._clearTimer()
    this.pendingMic = null
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop()
      } catch {
        this.recorder = null
        this._closeAudio()
        this.notify({ recording: false, startedAt: null })
      }
    } else if (this.recorder === null) {
      this.notify({ recording: false, startedAt: null })
    }
    // onstop fires asynchronously and closes the audio then.
    this._closeAudio()
  }

  /**
   * Take the recorded clip and clear it. Returns null when no clip was recorded.
   * Called by the Report screen just before submitting.
   */
  takeClip(): Blob | null {
    const clip = this.snap.clip
    if (clip) this.notify({ clip: null })
    return clip
  }

  /**
   * Stop the recording, flush any buffered data with requestData(), and wait
   * for the onstop blob. Resolves with:
   *   - the recorded Blob when data was captured
   *   - null when the recorder was never started, onstop produced no data,
   *     or the timeout fires before onstop (~3 s by default)
   *
   * While finalising, discard() is a no-op so navigation cleanup cannot throw
   * away a clip that is still being committed to memory by the browser.
   *
   * Safe to call when the recorder is already stopped (waits for onstop that
   * may still be pending) or when no recording was ever made (returns null
   * immediately).
   */
  stopAndTakeClip(timeoutMs = 3000): Promise<Blob | null> {
    if (this.snap.clip) return Promise.resolve(this.takeClip())
    if (!this.snap.recording && this.recorder === null) return Promise.resolve(null)

    this.finalizing = true
    return new Promise<Blob | null>((resolve) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null

      // unsub is assigned below; all callers run after the synchronous setup.
      let unsub: () => void = () => undefined

      const settle = (clip: Blob | null) => {
        if (settled) return
        settled = true
        this.finalizing = false
        if (timer !== null) { clearTimeout(timer); timer = null }
        unsub()
        resolve(clip)
      }

      unsub = this.subscribe(() => {
        if (settled) return
        if (this.snap.clip !== null) {
          // Unsubscribe before takeClip() so its internal notify({ clip: null })
          // does not re-fire this listener and race settle() to null.
          unsub()
          settle(this.takeClip())
        } else if (!this.snap.recording && this.recorder === null) {
          settle(null)
        }
      })

      // Flush any buffered chunk before stopping (requestData fires
      // ondataavailable, which adds to chunks before onstop is delivered).
      if (this.recorder && this.recorder.state === 'recording') {
        try { this.recorder.requestData() } catch { /* best effort */ }
      }
      // Stop the recorder if it is still active. If it is already in the
      // 'inactive' state (stop() was called externally), just wait for onstop.
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.stop()
      }

      // Timeout fallback: resolve null if onstop never fires.
      timer = setTimeout(() => settle(null), timeoutMs)
    })
  }

  /**
   * Discard the clip without uploading (volunteer left the screen without submitting).
   * No-op while stopAndTakeClip() is pending so navigation cleanup cannot
   * throw away a clip being flushed by the browser.
   */
  discard(): void {
    if (this.finalizing) return
    if (this.snap.clip) this.notify({ clip: null })
    this.chunks = []
  }

  private _clearTimer(): void {
    if (this.capTimer !== null) {
      clearTimeout(this.capTimer)
      this.capTimer = null
    }
  }

  private _closeAudio(): void {
    this._doDisconnect()
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined)
      this.ctx = null
    }
    this.destination = null
  }
}

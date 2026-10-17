/**
 * Live camera preview for the Report tab. It only shows the camera on the phone's own screen.
 * Nothing here records, uploads or sends a frame; the photo report keeps its own capture flow.
 *
 * The controller takes the browser objects as arguments so it can be tested without a browser.
 * - Nothing starts until `start()` is called, and `start()` must come from a tap (it may open the permission prompt).
 * - Every track is stopped on `stop()`, `dispose()`, when the page is hidden, and when the device ends the stream.
 */
export type CameraState =
  /** Not running. The default until the volunteer turns it on. */
  | 'off'
  | 'starting'
  | 'on'
  /** The volunteer (or a policy) blocked the camera. Only the browser's site settings can fix it. */
  | 'denied'
  /** No camera, or this browser cannot open one. */
  | 'unavailable'
  /** Another app is holding the camera. */
  | 'busy'
  /** The page is not on https, so the browser will not open the camera. */
  | 'insecure'

export interface TrackLike {
  stop(): void
  addEventListener?(type: 'ended', listener: () => void): void
  removeEventListener?(type: 'ended', listener: () => void): void
}

export interface StreamLike {
  getTracks(): TrackLike[]
}

export interface CameraEnv {
  mediaDevices: { getUserMedia(constraints: MediaStreamConstraints): Promise<StreamLike> } | null
  /** `window.isSecureContext`. Undefined counts as secure (older runtimes). */
  isSecureContext?: boolean
  doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> | null
  win: Pick<Window, 'addEventListener' | 'removeEventListener'> | null
}

export interface CameraSnapshot {
  state: CameraState
  stream: StreamLike | null
}

/** Rear camera when there is one, video only. Audio is never requested here: the microphone belongs to Hold to talk. */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
}

export function browserCameraEnv(): CameraEnv {
  return {
    mediaDevices: typeof navigator !== 'undefined' && navigator.mediaDevices ? (navigator.mediaDevices as CameraEnv['mediaDevices']) : null,
    isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : undefined,
    doc: typeof document !== 'undefined' ? document : null,
    win: typeof window !== 'undefined' ? window : null,
  }
}

/** Plain-words reason for a getUserMedia failure. */
export function stateForError(error: unknown): CameraState {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'denied'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy'
    default:
      // NotFoundError, OverconstrainedError, TypeError and anything unknown: no usable camera.
      return 'unavailable'
  }
}

export class CameraController {
  private snap: CameraSnapshot = { state: 'off', stream: null }
  private listeners = new Set<() => void>()
  /** Bumped on every start and stop, so a getUserMedia that finishes late is stopped and ignored. */
  private ticket = 0
  private attached = false
  private endedHandlers: Array<{ track: TrackLike; handler: () => void }> = []

  constructor(private readonly env: CameraEnv) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): CameraSnapshot => this.snap

  private set(next: CameraSnapshot) {
    this.snap = next
    this.listeners.forEach((l) => l())
  }

  /** Start watching for the page being hidden. Pair with `dispose()`. Safe to call again after `dispose()`. */
  attach() {
    if (this.attached) return
    this.attached = true
    this.env.doc?.addEventListener('visibilitychange', this.onVisibility)
    this.env.win?.addEventListener('pagehide', this.onHide)
  }

  /** Stop the camera and stop listening. */
  dispose() {
    this.stop()
    if (!this.attached) return
    this.attached = false
    this.env.doc?.removeEventListener('visibilitychange', this.onVisibility)
    this.env.win?.removeEventListener('pagehide', this.onHide)
  }

  private onVisibility = () => {
    if (this.env.doc?.visibilityState === 'hidden') this.stop()
  }
  private onHide = () => this.stop()

  /** Open the camera. Call it from a tap. A second call while starting or on does nothing. */
  async start(): Promise<void> {
    if (this.snap.state === 'starting' || this.snap.state === 'on') return
    const media = this.env.mediaDevices
    if (this.env.isSecureContext === false) return this.set({ state: 'insecure', stream: null })
    if (!media || typeof media.getUserMedia !== 'function') return this.set({ state: 'unavailable', stream: null })
    const ticket = ++this.ticket
    this.set({ state: 'starting', stream: null })
    try {
      const stream = await media.getUserMedia(CAMERA_CONSTRAINTS)
      if (ticket !== this.ticket) {
        // Turned off (or left the screen) while the prompt was open: do not keep the camera.
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      this.watchEnd(stream, ticket)
      this.set({ state: 'on', stream })
    } catch (error) {
      if (ticket !== this.ticket) return
      this.set({ state: stateForError(error), stream: null })
    }
  }

  /** Turn the camera off and release every track. An error message (denied, busy…) stays until the next try. */
  stop() {
    this.release()
    if (this.snap.state === 'on' || this.snap.state === 'starting') this.set({ state: 'off', stream: null })
  }

  toggle(): Promise<void> | void {
    return this.snap.state === 'on' || this.snap.state === 'starting' ? this.stop() : this.start()
  }

  /** Stop every track and drop the stream. The caller announces the new state. */
  private release() {
    this.ticket += 1
    const stream = this.snap.stream
    this.endedHandlers.forEach(({ track, handler }) => track.removeEventListener?.('ended', handler))
    this.endedHandlers = []
    stream?.getTracks().forEach((track) => track.stop())
    if (stream) this.snap = { ...this.snap, stream: null }
  }

  /** The device can end the stream by itself (camera unplugged, taken by another app). */
  private watchEnd(stream: StreamLike, ticket: number) {
    for (const track of stream.getTracks()) {
      const handler = () => {
        if (ticket === this.ticket) this.stop()
      }
      track.addEventListener?.('ended', handler)
      this.endedHandlers.push({ track, handler })
    }
  }
}

import { useEffect, useRef } from 'react'

import { t, type Lang } from '../i18n'
import type { CameraState, StreamLike } from './cameraController'
import { cameraStrings as s } from './cameraStrings'
import './camera.css'

interface Props {
  lang: Lang
  state: CameraState
  stream: StreamLike | null
  onToggle: () => void
  /** Location accuracy in metres, or null when the phone has no fix. The chip is left out when null. */
  accuracyM: number | null
  /** Back to the home tab. Left out when there is no place to go back to. */
  onBack?: () => void
  /**
   * True only while frames really go to the coach. The browser handshake with voice-gateway is not defined yet
   * (shared contract section 7), so the Report tab passes false and the caption says "preview only".
   */
  framesToCoach?: boolean
}

function CameraIcon({ off }: { off: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon={off ? 'camera-off' : 'camera'}>
      <path d="M4 6h3l1.2-2h7.6L17 6h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="12.5" r="3.5" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  )
}

function problemText(state: CameraState): (typeof s)[keyof typeof s] | null {
  switch (state) {
    case 'denied':
      return s.denied
    case 'unavailable':
      return s.unavailable
    case 'busy':
      return s.busy
    case 'insecure':
      return s.insecure
    default:
      return null
  }
}

/**
 * The dark camera panel at the top of the Report tab. Its height is fixed, so turning the camera on or off, or an
 * error message, never moves what is below. The camera starts only from the toggle tap.
 */
export function CameraPanel({ lang, state, stream, onToggle, accuracyM, onBack, framesToCoach = false }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const running = state === 'on'
  const problem = problemText(state)

  useEffect(() => {
    const el = video.current
    if (!el) return
    // iOS Safari only autoplays a muted, inline video.
    el.muted = true
    el.srcObject = stream as MediaStream | null
    if (stream) void el.play().catch(() => undefined)
    return () => {
      el.srcObject = null
    }
  }, [stream])

  const caption =
    state === 'on' ? (framesToCoach ? s.captionToCoach : s.captionPreview) : state === 'starting' ? s.captionStarting : problem ? s.captionProblem : s.captionOff

  return (
    <section className="cam" data-testid="camera-panel" data-camera={state} aria-label={t(lang, s.panel)}>
      <video ref={video} className="cam-video" data-testid="camera-video" playsInline muted autoPlay hidden={!running} aria-hidden="true" />
      <div className="cam-shade" aria-hidden="true" />
      <div className="cam-ring" aria-hidden="true">
        <i />
      </div>

      <div className="cam-top">
        <div className="cam-chips">
          {accuracyM !== null && (
            <span className="cam-chip" data-testid="camera-accuracy" title={t(lang, s.accuracy)}>
              <i className="cam-dot ok" aria-hidden="true" />±{accuracyM} m
            </span>
          )}
        </div>
        {onBack && (
          <button type="button" className="cam-back" aria-label={t(lang, s.back)} onClick={onBack}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>
        )}
      </div>

      {problem && (
        <p className="cam-problem" role="status" data-testid="camera-problem">
          {t(lang, problem)}
        </p>
      )}

      <div className="cam-bottom">
        <p className="cam-caption" data-testid="camera-caption">
          {t(lang, caption)}
        </p>
        <button
          type="button"
          className={`cam-toggle${running ? ' is-on' : ''}`}
          aria-label={t(lang, s.toggle)}
          aria-pressed={running}
          aria-busy={state === 'starting' || undefined}
          title={t(lang, running || state === 'starting' ? s.turnOff : s.turnOn)}
          data-testid="camera-toggle"
          onClick={onToggle}
        >
          <CameraIcon off={!running} />
        </button>
      </div>
    </section>
  )
}

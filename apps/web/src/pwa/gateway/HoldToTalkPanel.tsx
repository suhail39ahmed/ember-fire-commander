import { useCallback, useEffect, useRef, useState } from 'react'
import { t, type Lang } from '../i18n'
import type { TalkView } from './voiceView'
import { TalkCard } from './TalkCard'
import { gatewayStrings } from './gatewayStrings'
import './talk.css'

/**
 * Hold to talk (#129). Reuses TalkCard; when listening, shows the live frame chrome.
 * Transcript text is only shown when the gateway already sent one — never invented.
 */
export function HoldToTalkPanel({
  lang,
  view,
  transcript,
  onPress,
  onRelease,
  onBack,
  accuracyM,
}: {
  lang: Lang
  view: TalkView
  transcript: string | null
  onPress: () => void
  onRelease: () => void
  onBack?: () => void
  accuracyM?: number | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const requestRef = useRef<Promise<MediaStream> | null>(null)
  const mountedRef = useRef(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraState, setCameraState] = useState<'starting' | 'live' | 'denied' | 'unavailable' | 'off'>('off')
  const listening = view.button === 'listening' || view.button === 'connecting'

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unavailable')
      return
    }
    setCameraState('starting')
    try {
      const request = requestRef.current ?? navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      requestRef.current = request
      const nextStream = await request
      if (!mountedRef.current) {
        nextStream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = nextStream
      setStream(nextStream)
      setCameraState('live')
    } catch (error) {
      requestRef.current = null
      const name = error instanceof DOMException ? error.name : ''
      setCameraState(name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'unavailable')
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    requestRef.current = null
    setStream(null)
    setCameraState('off')
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [startCamera])

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  return (
    <section className={`hold-panel${listening ? ' hold-live' : ''}`} data-testid="hold-to-talk">
      <div className={`hold-camera${cameraState === 'live' ? ' has-camera' : ' camera-off'}`} data-camera-state={cameraState} role="group" aria-label={t(lang, gatewayStrings.liveCamera)}>
        {cameraState === 'live' && <video ref={videoRef} className="hold-camera-video" autoPlay muted playsInline aria-label={t(lang, gatewayStrings.liveCamera)} />}
        <div className="hold-camera-top">
          <svg className="camera-emblem" viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1 22 5v8c0 6-4 11-10 14C6 24 2 19 2 13V5l10-4Z" /><path d="M13 7c1 3-2 4-2 7 0 1 1 2 2 2s3-1 3-3c2 3 1 7-3 8-4 0-6-3-5-6 1-3 4-4 5-8Z" /></svg>
          {cameraState === 'live' && <span className="camera-live-dot" />}
          <span>{t(lang, cameraState === 'live' ? gatewayStrings.cameraLive : cameraState === 'off' ? gatewayStrings.cameraOff : gatewayStrings.cameraUnavailableLabel)}</span>
          {accuracyM != null && Number.isFinite(accuracyM) && <span className="camera-accuracy">±{Math.round(accuracyM)} m</span>}
        </div>
        {onBack && <button type="button" className="camera-back" onClick={onBack} aria-label={t(lang, gatewayStrings.back)}>‹</button>}
        {cameraState !== 'live' && (
          <div className="camera-unavailable" role="status" aria-live="polite">
            <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 18h29a5 5 0 0 1 5 5v4l10-7a3 3 0 0 1 5 2v20a3 3 0 0 1-5 2l-10-7v4a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V23a5 5 0 0 1 5-5Z" /><path d="m16 10 38 44" /></svg>
            <p>{t(lang, cameraState === 'starting' ? gatewayStrings.cameraStarting : cameraState === 'denied' ? gatewayStrings.cameraDenied : cameraState === 'off' ? gatewayStrings.cameraPreview : gatewayStrings.cameraUnavailable)}</p>
            {(cameraState === 'denied' || cameraState === 'unavailable' || cameraState === 'off') && (
              <button type="button" className="camera-retry" onClick={() => void startCamera()}>{t(lang, cameraState === 'off' ? gatewayStrings.cameraOpen : gatewayStrings.cameraRetry)}</button>
            )}
          </div>
        )}
        {cameraState === 'live' && <button type="button" className="camera-stop" onClick={stopCamera}>{t(lang, gatewayStrings.cameraStop)}</button>}
        <p className="hold-camera-label">{t(lang, gatewayStrings.liveCamera)}</p>
      </div>
      {listening && (
        <p className="hold-transcript" data-testid="hold-transcript" aria-live="polite">
          {transcript ?? t(lang, gatewayStrings.listeningHint)}
        </p>
      )}
      <TalkCard lang={lang} view={view} onPress={onPress} onRelease={onRelease} />
      {listening && <p className="muted small hold-hint">{t(lang, gatewayStrings.releaseHint)}</p>}
      {view.button === 'unavailable' && (
        <p className="muted small" data-testid="hold-unavailable">
          {t(lang, gatewayStrings.unavailableHint)}
        </p>
      )}
    </section>
  )
}

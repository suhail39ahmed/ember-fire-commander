import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { browserCameraEnv, CameraController, type CameraSnapshot } from '../camera/cameraController'
import { cameraStrings } from '../camera/cameraStrings'
import { t, type Lang } from '../i18n'
import { attachmentStrings as s } from './attachmentStrings'

const OFF: CameraSnapshot = { state: 'off', stream: null }

/** Capture a still from the existing camera controller, without starting a video recording. */
export function PhotoCamera({ lang, onCapture, onCancel }: { lang: Lang; onCapture: (file: File) => void; onCancel: () => void }) {
  const [controller] = useState(() => new CameraController(browserCameraEnv()))
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => OFF)
  const video = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    controller.attach()
    void controller.start()
    return () => controller.dispose()
  }, [controller])
  useEffect(() => {
    const element = video.current
    if (!element) return
    element.srcObject = snap.stream as MediaStream | null
    if (snap.stream) void element.play().catch(() => undefined)
    return () => { element.srcObject = null }
  }, [snap.stream])

  async function take() {
    const element = video.current
    if (!element || !element.videoWidth || capturing) return
    setCapturing(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = element.videoWidth
      canvas.height = element.videoHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No canvas')
      context.drawImage(element, 0, 0)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', .82))
      if (!blob) throw new Error('No image')
      controller.stop()
      onCapture(new File([blob], `camera-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    } catch { setFailed(true); setCapturing(false) }
  }
  const problem = snap.state === 'denied' ? cameraStrings.denied
    : snap.state === 'insecure' ? cameraStrings.insecure
      : snap.state === 'busy' ? cameraStrings.busy
        : snap.state === 'unavailable' ? cameraStrings.unavailable : null
  return <div className="attachment-camera" role="group" aria-label={t(lang, s.take)}>
    <video ref={video} autoPlay playsInline muted onLoadedData={() => setReady(true)} hidden={snap.state !== 'on'} aria-label={t(lang, cameraStrings.panel)} />
    {problem && <p className="error" role="status">{t(lang, problem)}</p>}
    {problem && <button type="button" className="btn secondary" onClick={() => void controller.start()}>{t(lang, s.retry)}</button>}
    {(snap.state === 'starting' || snap.state === 'off') && <p role="status">{t(lang, cameraStrings.captionStarting)}</p>}
    {failed && <p className="error" role="alert">{t(lang, s.badPhoto)}</p>}
    <button type="button" className="btn primary" disabled={!ready || snap.state !== 'on' || capturing} onClick={() => void take()}>{t(lang, s.take)}</button>
    <button type="button" className="btn secondary" onClick={onCancel}>{t(lang, s.cancel)}</button>
  </div>
}

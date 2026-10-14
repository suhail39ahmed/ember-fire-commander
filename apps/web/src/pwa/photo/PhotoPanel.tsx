import { useEffect, useRef, useState } from 'react'
import type { PhotoContentType, PhotoObservationCreate } from '../contracts/types'
import { ApiError, type EmberApi } from '../api/types'
import { t, type Lang } from '../i18n'
import type { Position } from '../report/buildObservation'
import { isAcceptedImage, preparePhoto } from './preparePhoto'
import { photoStrings as s } from './strings'
import { UploadError, type UploadFn } from './upload'
import { buildPhotoObservation, uploadPhoto } from './uploadPhoto'
import './photo.css'

interface Shot {
  blob: Blob
  contentType: PhotoContentType
  previewUrl: string
  capturedAt: string
  pos: Position
  /** Set once the upload succeeded; a retry then only re-sends the report. */
  photoPath: string | null
}

type Status =
  | { kind: 'idle' }
  | { kind: 'preparing' }
  | { kind: 'uploading'; progress: number }
  | { kind: 'submitting' }
  | { kind: 'done' }
  | { kind: 'error'; message: string; retryable: boolean }

interface Props {
  api: EmberApi
  upload: UploadFn
  lang: Lang
  getPosition: () => Promise<Position | null>
  /** Sends the photo observation. Defaults to POST /observations. */
  submit?: (body: PhotoObservationCreate) => Promise<void>
}

function describe(e: unknown, lang: Lang): { message: string; retryable: boolean } {
  if (e instanceof UploadError) return { message: t(lang, s.failed), retryable: e.retryable }
  if (e instanceof ApiError && !e.retryable) {
    const detail = Object.values(e.fields).join('; ') || e.message
    return { message: `${t(lang, s.rejected)} ${detail}`, retryable: false }
  }
  return { message: t(lang, s.failed), retryable: true }
}

/** #20: take one still, upload it to a signed URL, then send `source: photo`. */
export function PhotoPanel({ api, upload, lang, getPosition, submit }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [shot, setShot] = useState<Shot | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    const url = shot?.previewUrl
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [shot?.previewUrl])

  async function send(current: Shot) {
    let photoPath = current.photoPath
    try {
      if (!photoPath) {
        const controller = new AbortController()
        abort.current = controller
        setStatus({ kind: 'uploading', progress: 0 })
        photoPath = await uploadPhoto(api, upload, current.blob, current.contentType, {
          signal: controller.signal,
          onProgress: (progress) => setStatus({ kind: 'uploading', progress }),
        })
        abort.current = null
        const uploaded = { ...current, photoPath }
        setShot(uploaded)
      }
      // source: photo is sent only after the upload succeeded.
      setStatus({ kind: 'submitting' })
      const body = buildPhotoObservation(photoPath, current.capturedAt, current.pos)
      await (submit ? submit(body) : api.createObservation(body).then(() => undefined))
      setStatus({ kind: 'done' })
    } catch (e) {
      abort.current = null
      if (e instanceof UploadError && e.kind === 'aborted') {
        setStatus({ kind: 'idle' })
        setShot(null)
        return
      }
      const failure = describe(e, lang)
      setStatus({ kind: 'error', ...failure, message: photoPath && failure.retryable ? t(lang, s.submitFailed) : failure.message })
    }
  }

  async function onFile(file: File | undefined) {
    if (input.current) input.current.value = ''
    if (!file) return
    if (!isAcceptedImage(file)) {
      setStatus({ kind: 'error', message: t(lang, s.badFile), retryable: false })
      return
    }
    const capturedAt = new Date().toISOString()
    setStatus({ kind: 'preparing' })
    const pos = await getPosition()
    if (!pos) {
      // lat and lng are required by ember-api.
      setStatus({ kind: 'error', message: t(lang, s.noLocation), retryable: false })
      return
    }
    let prepared: { blob: Blob; contentType: PhotoContentType }
    try {
      prepared = await preparePhoto(file)
    } catch {
      setStatus({ kind: 'error', message: t(lang, s.badFile), retryable: false })
      return
    }
    const next: Shot = { ...prepared, previewUrl: URL.createObjectURL(prepared.blob), capturedAt, pos, photoPath: null }
    setShot(next)
    await send(next)
  }

  function retake() {
    abort.current?.abort()
    setShot(null)
    setStatus({ kind: 'idle' })
    input.current?.click()
  }

  const busy = status.kind === 'preparing' || status.kind === 'uploading' || status.kind === 'submitting'
  const pct = status.kind === 'uploading' ? Math.round(status.progress * 100) : 0
  const time = shot
    ? new Date(shot.capturedAt).toLocaleTimeString(lang === 'id' ? 'id-ID' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <section className="card photo" aria-labelledby="photo-label">
      <h3 id="photo-label" className="section-label">
        {t(lang, s.label)}
      </h3>
      <input
        ref={input}
        className="photo-input"
        type="file"
        accept="image/jpeg,image/webp,image/*"
        capture="environment"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {shot && (
        <div className="photo-preview">
          <img src={shot.previewUrl} alt={t(lang, s.previewAlt)} />
          <span className="photo-stamp">
            {t(lang, s.takenAt)} · {time}
          </span>
        </div>
      )}

      {status.kind === 'idle' && <p className="muted small">{t(lang, s.framing)}</p>}
      {status.kind === 'preparing' && (
        <p className="photo-status" role="status">
          {t(lang, s.preparing)}
        </p>
      )}
      {status.kind === 'uploading' && (
        <>
          <p className="photo-status" role="status">
            {t(lang, s.uploading)} {pct}%
          </p>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="muted small">{t(lang, s.keepOpen)}</p>
        </>
      )}
      {status.kind === 'submitting' && (
        <p className="photo-status" role="status">
          {t(lang, s.submitting)}
        </p>
      )}
      {status.kind === 'done' && (
        <div className="sent" role="status">
          <strong>{t(lang, s.uploaded)}</strong>
          <span>{t(lang, s.uploadedDetail)}</span>
        </div>
      )}
      {status.kind === 'error' && (
        <div role="alert">
          <p className="photo-status failed">{status.message}</p>
          {status.retryable && <p className="muted small">{t(lang, s.failedDetail)}</p>}
        </div>
      )}

      <div className="photo-actions">
        {status.kind === 'idle' && (
          <button type="button" className="btn primary" onClick={() => input.current?.click()}>
            {t(lang, s.take)}
          </button>
        )}
        {status.kind === 'uploading' && (
          <>
            <button type="button" className="btn primary" disabled>
              {t(lang, s.waiting)}
            </button>
            <button type="button" className="btn secondary" onClick={() => abort.current?.abort()}>
              {t(lang, s.cancel)}
            </button>
          </>
        )}
        {status.kind === 'error' && status.retryable && shot && (
          <button type="button" className="btn primary" onClick={() => void send(shot)}>
            {t(lang, s.retry)}
          </button>
        )}
        {(status.kind === 'done' || status.kind === 'error') && (
          <button type="button" className="btn secondary" disabled={busy} onClick={retake}>
            {t(lang, status.kind === 'done' ? s.another : s.retake)}
          </button>
        )}
      </div>
    </section>
  )
}

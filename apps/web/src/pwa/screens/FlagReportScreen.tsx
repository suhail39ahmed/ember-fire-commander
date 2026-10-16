import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '../api/types'
import { FLAG_REASONS, type FlagReason, type IncidentDetail, type Observation, type PhotoContentType } from '../contracts/types'
import { formatTime } from '../formatTime'
import { t, type Lang } from '../i18n'
import { incidentLabel } from '../incidentName'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { isAcceptedImage, preparePhoto } from '../photo/preparePhoto'
import { uploadPhoto } from '../photo/uploadPhoto'
import { reportTitle } from './reportTitle'
import { screenStrings } from './strings'
import { useIncidentDetail } from './useIncidentDetail'

const s = screenStrings

export interface FlagPhoto {
  blob: Blob
  contentType: PhotoContentType
  previewUrl: string
}

export type FlagSend = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done' } | { kind: 'error'; message: string }

/** Flag a wrong or fake report (#141): which incident and report, why, an optional photo, send. */
export function FlagReportView({
  lang,
  incident,
  report,
  reason,
  photo,
  send,
  own,
  onReason,
  onPickPhoto,
  onSend,
  onBack,
}: {
  lang: Lang
  incident: IncidentDetail['incident']
  report: Observation
  reason: FlagReason | null
  photo: FlagPhoto | null
  send: FlagSend
  /** The report is the volunteer's own, which cannot be flagged. */
  own: boolean
  onReason: (reason: FlagReason) => void
  onPickPhoto: (file: File | undefined) => void
  onSend: () => void
  onBack: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const busy = send.kind === 'sending'
  return (
    <>
      <div className="screen-head">
        <button type="button" className="back" onClick={onBack} aria-label={t(lang, s.common.back)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <h2>{t(lang, s.flag.action)}</h2>
      </div>
      <p className="section-label mono" data-testid="flag-context">
        {incidentLabel(incident)} · {formatTime(report.capturedAt)} · {reportTitle(report, lang)}
      </p>

      {own ? (
        <p className="notice" role="status" data-testid="flag-own">{t(lang, s.flag.ownReport)}</p>
      ) : send.kind === 'done' ? (
        <section className="sent" role="status" data-testid="flag-done">
          <strong>{t(lang, s.flag.done)}</strong>
          <span>{t(lang, s.flag.doneBody)}</span>
          <Link className="btn secondary report-cta" to={`/pwa/incidents/${encodeURIComponent(incident.id)}`}>{t(lang, s.common.back)}</Link>
        </section>
      ) : (
        <>
          <h3 className="flag-title">{t(lang, s.flag.title)}</h3>
          <div className="chips" role="radiogroup" aria-label={t(lang, s.flag.title)}>
            {FLAG_REASONS.map((value) => (
              <button key={value} type="button" role="radio" aria-checked={reason === value} className={`chip${reason === value ? ' selected' : ''}`} disabled={busy} onClick={() => onReason(value)} data-testid={`flag-reason-${value}`}>
                {t(lang, s.flag.reasons[value])}
              </button>
            ))}
          </div>

          <input
            ref={input}
            className="photo-input"
            type="file"
            accept="image/jpeg,image/webp,image/*"
            capture="environment"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              onPickPhoto(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {photo && (
            <div className="photo-preview" data-testid="flag-preview">
              <img src={photo.previewUrl} alt="" />
            </div>
          )}
          <button type="button" className="btn secondary" disabled={busy} onClick={() => input.current?.click()} data-testid="flag-photo">
            {photo ? t(lang, s.flag.retake) : t(lang, s.flag.photo)}
          </button>

          <button type="button" className="btn ink" disabled={reason === null || busy} onClick={onSend} data-testid="flag-send">
            {busy ? t(lang, s.flag.sending) : t(lang, s.flag.send)}
          </button>
          {send.kind === 'error' && <p className="error" role="alert" data-testid="flag-error">{send.message}</p>}
          <p className="muted small">{t(lang, s.flag.note)}</p>
        </>
      )}
    </>
  )
}

export function FlagReportScreen() {
  const { lang } = useLanguage()
  const { api, upload, volunteerId } = useVolunteer()
  const { id = '', obsId = '' } = useParams()
  const navigate = useNavigate()
  const { state, reload } = useIncidentDetail(api, id)
  const [reason, setReason] = useState<FlagReason | null>(null)
  const [photo, setPhoto] = useState<FlagPhoto | null>(null)
  const [send, setSend] = useState<FlagSend>({ kind: 'idle' })
  const previewUrl = photo?.previewUrl
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl],
  )

  if (state.kind === 'loading') return <p className="muted" role="status">{t(lang, s.common.loading)}</p>
  const report = state.kind === 'ready' ? state.detail.observations.find((o) => o.id === obsId) : undefined
  if (state.kind !== 'ready' || !report) {
    const retry = state.kind === 'error' && state.retryable
    return (
      <>
        <p className="notice" role="alert" data-testid="flag-missing">{t(lang, s.flag.reportNotFound)}</p>
        {retry && <button type="button" className="btn secondary" onClick={reload}>{t(lang, s.common.retry)}</button>}
        <button type="button" className="btn secondary" onClick={() => navigate(-1)}>{t(lang, s.common.back)}</button>
      </>
    )
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    if (!isAcceptedImage(file)) return setSend({ kind: 'error', message: t(lang, s.flag.noPhotoLocation) })
    try {
      const prepared = await preparePhoto(file)
      setPhoto({ blob: prepared.blob, contentType: prepared.contentType, previewUrl: URL.createObjectURL(prepared.blob) })
      setSend({ kind: 'idle' })
    } catch {
      setSend({ kind: 'error', message: t(lang, s.flag.noPhotoLocation) })
    }
  }

  async function submit() {
    if (!reason) return
    setSend({ kind: 'sending' })
    try {
      const photoPath = photo ? await uploadPhoto(api, upload, photo.blob, photo.contentType) : null
      await api.flagObservation(obsId, { reason, photoPath })
      setSend({ kind: 'done' })
    } catch (error) {
      const own = error instanceof ApiError && error.status === 409
      setSend({ kind: 'error', message: t(lang, own ? s.flag.ownReport : s.flag.failed) })
    }
  }

  return (
    <FlagReportView
      lang={lang}
      incident={state.detail.incident}
      report={report}
      reason={reason}
      photo={photo}
      send={send}
      own={report.volunteerId === volunteerId}
      onReason={setReason}
      onPickPhoto={(file) => void pickPhoto(file)}
      onSend={() => void submit()}
      onBack={() => navigate(-1)}
    />
  )
}

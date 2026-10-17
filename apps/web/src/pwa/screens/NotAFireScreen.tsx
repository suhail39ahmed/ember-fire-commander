import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '../api/types'
import { clockMessage, isClockRejection, stampNow } from '../clock'
import type { PhotoContentType } from '../contracts/types'
import { t, type Lang } from '../i18n'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { isAcceptedImage, preparePhoto } from '../photo/preparePhoto'
import { UploadError } from '../photo/upload'
import { buildPhotoObservation, uploadPhoto } from '../photo/uploadPhoto'
import { buildObservation, type Position } from '../report/buildObservation'
import { getPosition } from '../report/location'
import { arrivalOf } from './arrival'
import { formatDistance } from './geo'
import { findIncident, findTask } from './incidentsView'
import { canSendNotAFire, NOT_A_FIRE_REASONS, notAFireNote, UNSURE_CHIP, UNSURE_TEXT, type NotAFireReason } from './notAFire'
import { screenStrings } from './strings'
import { useDevicePosition } from './useDevicePosition'

const s = screenStrings

export interface Shot {
  blob: Blob
  contentType: PhotoContentType
  previewUrl: string
  capturedAt: string
  pos: Position
}

export type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; queued: boolean }
  | { kind: 'error'; message: string }

/** Not a fire (#139): pick what was seen, add a proof photo, send. Send stays off until both are there. */
export function NotAFireView({
  lang,
  instruction,
  distanceText,
  reason,
  shot,
  state,
  onReason,
  onPickPhoto,
  onSend,
  onUnsure,
  onBack,
}: {
  lang: Lang
  instruction: string | null
  distanceText: string | null
  reason: NotAFireReason | null
  shot: Shot | null
  state: SendState
  onReason: (reason: NotAFireReason) => void
  onPickPhoto: (file: File | undefined) => void
  onSend: () => void
  onUnsure: () => void
  onBack: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const busy = state.kind === 'sending'
  const ready = canSendNotAFire(reason, shot !== null)
  return (
    <>
      <div className="screen-head">
        <button type="button" className="back" onClick={onBack} aria-label={t(lang, s.common.back)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <h2>{t(lang, s.notFire.title)}</h2>
      </div>
      {instruction && <p className="muted">{instruction}</p>}
      {distanceText && <p className="muted small mono" data-testid="notfire-distance">{distanceText}</p>}

      {state.kind === 'done' ? (
        <section className="sent" role="status" data-testid="notfire-done">
          <strong>{t(lang, s.notFire.done)}</strong>
          <span>{t(lang, state.queued ? s.notFire.queuedBody : s.notFire.doneBody)}</span>
          <Link className="btn secondary report-cta" to="/pwa">{t(lang, s.tabs.home)}</Link>
        </section>
      ) : (
        <>
          <fieldset className="choices">
            <legend className="section-label">{t(lang, s.notFire.lead)}</legend>
            {NOT_A_FIRE_REASONS.map((value) => (
              <label key={value} className="choice">
                <input type="radio" name="not-a-fire-reason" value={value} checked={reason === value} onChange={() => onReason(value)} />
                <span>{t(lang, s.notFire.reasons[value])}</span>
              </label>
            ))}
          </fieldset>

          <section className="card" aria-labelledby="notfire-photo-label">
            <h3 id="notfire-photo-label" className="section-label">{t(lang, s.notFire.photoLabel)}</h3>
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
            {shot && (
              <div className="photo-preview" data-testid="notfire-preview">
                <img src={shot.previewUrl} alt="" />
                <span className="photo-stamp mono">
                  {t(lang, s.notFire.accuracy)} ±{shot.pos.accuracyM ?? '?'} m
                </span>
              </div>
            )}
            <button type="button" className="btn secondary" disabled={busy} onClick={() => input.current?.click()}>
              {shot ? t(lang, s.notFire.retake) : t(lang, s.notFire.takePhoto)}
            </button>
          </section>

          <button type="button" className="btn primary" disabled={!ready || busy} onClick={onSend} data-testid="notfire-send">
            {busy ? t(lang, s.notFire.sending) : t(lang, s.notFire.send)}
          </button>
          {!ready && <p className="muted small" data-testid="notfire-hint">{t(lang, s.notFire.needReasonAndPhoto)}</p>}
          {state.kind === 'error' && <p className="error" role="alert">{state.message}</p>}

          <button type="button" className="btn secondary" disabled={busy} onClick={onUnsure} data-testid="notfire-unsure">
            {t(lang, s.notFire.unsure)}
          </button>
          <p className="muted small">{t(lang, s.notFire.unsureNote)}</p>
        </>
      )}
    </>
  )
}

export function NotAFireScreen() {
  const { lang } = useLanguage()
  const { api, upload, outbox, digest } = useVolunteer()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const task = findTask(digest, id)
  const incident = task ? findIncident(digest, task.incidentId) : null
  const position = useDevicePosition(true)
  const arrival = arrivalOf(position, incident ? { lat: incident.lat, lng: incident.lng } : null)
  const distanceText =
    arrival.kind === 'far' || arrival.kind === 'there'
      ? `${formatDistance(arrival.distanceM).value} ${formatDistance(arrival.distanceM).unit}`
      : null

  const [reason, setReason] = useState<NotAFireReason | null>(null)
  const [shot, setShot] = useState<Shot | null>(null)
  const [state, setState] = useState<SendState>({ kind: 'idle' })
  const previewUrl = shot?.previewUrl
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl],
  )

  const fail = (message: string) => setState({ kind: 'error', message })
  const describe = (error: unknown): string => {
    if (error instanceof ApiError && !error.retryable && isClockRejection(error.fields)) return clockMessage(lang)
    return t(lang, s.notFire.failed)
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    if (!isAcceptedImage(file)) return fail(t(lang, s.notFire.badPhoto))
    const capturedAt = stampNow()
    const pos = await getPosition()
    if (!pos) return fail(t(lang, s.notFire.noLocation))
    try {
      const prepared = await preparePhoto(file)
      setShot({ ...prepared, previewUrl: URL.createObjectURL(prepared.blob), capturedAt, pos })
      setState({ kind: 'idle' })
    } catch {
      fail(t(lang, s.notFire.badPhoto))
    }
  }

  async function send() {
    if (!reason || !shot) return
    setState({ kind: 'sending' })
    try {
      const photoPath = await uploadPhoto(api, upload, shot.blob, shot.contentType)
      const result = await outbox.submit(buildPhotoObservation(photoPath, shot.capturedAt, shot.pos, notAFireNote(reason), undefined, task?.id))
      setState({ kind: 'done', queued: result === 'queued' })
    } catch (error) {
      fail(error instanceof UploadError ? t(lang, s.notFire.failed) : describe(error))
    }
  }

  async function unsure() {
    setState({ kind: 'sending' })
    const pos = await getPosition()
    if (!pos) return fail(t(lang, s.notFire.noLocation))
    try {
      const result = await outbox.submit(buildObservation({ chip: UNSURE_CHIP, text: UNSURE_TEXT, capturedAt: stampNow() }, pos))
      setState({ kind: 'done', queued: result === 'queued' })
    } catch (error) {
      fail(describe(error))
    }
  }

  return (
    <NotAFireView
      lang={lang}
      instruction={task?.instruction ?? null}
      distanceText={distanceText}
      reason={reason}
      shot={shot}
      state={state}
      onReason={setReason}
      onPickPhoto={(file) => void pickPhoto(file)}
      onSend={() => void send()}
      onUnsure={() => void unsure()}
      onBack={() => navigate(`/pwa/task/${encodeURIComponent(id)}`, { replace: true })}
    />
  )
}

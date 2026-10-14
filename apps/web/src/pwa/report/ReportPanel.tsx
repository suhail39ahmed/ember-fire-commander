import { useEffect, useRef, useState } from 'react'
import { CHIP_VALUES, type ChipValue, type ObservationCreate } from '../contracts/types'
import { ApiError, type EmberApi } from '../api/types'
import { strings, t, type Lang } from '../i18n'
import { outboxStrings } from '../outbox/strings'
import { buildObservation, MAX_NOTE_LENGTH, validateDraft, type Position } from './buildObservation'

const CHIP_LABEL: Record<ChipValue, string> = {
  asap: 'asap',
  api: 'api',
  aman: 'aman',
  butuh_bantuan: 'butuh bantuan',
}

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; at: string }
  | { kind: 'queued' }
  | { kind: 'error'; message: string; retryable: boolean }

interface Props {
  api: EmberApi
  lang: Lang
  getPosition: () => Promise<Position | null>
  /** Pre-select a chip from the task card ("Not a fire" → aman). `n` changes on each request. */
  preset?: { chip: ChipValue | null; n: number }
  /** Sends through the offline outbox (#21). Without it the report goes straight to POST /observations. */
  submit?: (body: ObservationCreate) => Promise<'sent' | 'queued'>
}

/** #17: chip and text report. Works without Live voice. */
export function ReportPanel({ api, lang, getPosition, preset, submit }: Props) {
  const [chip, setChip] = useState<ChipValue | null>(null)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  // capturedAt is fixed when the report is first sent and reused on retry.
  const pending = useRef<{ capturedAt: string } | null>(null)
  const statusRef = useRef(status)
  statusRef.current = status

  useEffect(() => {
    if (!preset || preset.n === 0) return
    const s = statusRef.current
    if (s.kind === 'idle' || (s.kind === 'error' && !s.retryable)) {
      setChip(preset.chip)
      setStatus({ kind: 'idle' })
    }
  }, [preset])

  // Inputs lock while a report is in flight or awaiting retry, so a retry sends the same report.
  const locked = status.kind === 'sending' || status.kind === 'sent' || status.kind === 'queued' || (status.kind === 'error' && status.retryable)
  const errorId = 'report-error'

  async function send() {
    const capturedAt = pending.current?.capturedAt ?? new Date().toISOString()
    const draft = { chip, text, capturedAt }
    const invalid = validateDraft(draft)
    if (invalid) {
      setStatus({ kind: 'error', retryable: false, message: t(lang, invalid === 'empty' ? strings.errEmpty : strings.errTooLong) })
      return
    }
    pending.current ??= { capturedAt }
    setStatus({ kind: 'sending' })
    const pos = await getPosition()
    if (!pos) {
      // lat and lng are required by ember-api; keep the draft so the volunteer can send again.
      pending.current = null
      setStatus({ kind: 'error', retryable: false, message: t(lang, strings.noLocation) })
      return
    }
    try {
      const body = buildObservation(draft, pos)
      if (submit && (await submit(body)) === 'queued') {
        setStatus({ kind: 'queued' })
        return
      }
      if (!submit) await api.createObservation(body)
      setStatus({
        kind: 'sent',
        at: new Date().toLocaleTimeString(lang === 'id' ? 'id-ID' : 'en-GB', { hour: '2-digit', minute: '2-digit' }),
      })
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('network', String(e), null, true)
      if (!err.retryable) pending.current = null
      const detail = Object.values(err.fields).join('; ') || err.message
      setStatus({
        kind: 'error',
        retryable: err.retryable,
        message: err.retryable ? t(lang, strings.errNetwork) : `${t(lang, strings.errApi)} ${detail}`,
      })
    }
  }

  function reset() {
    pending.current = null
    setChip(null)
    setText('')
    setStatus({ kind: 'idle' })
  }

  const showChipError = status.kind === 'error' && !status.retryable && !chip && !text.trim()

  return (
    <section className="card report" aria-labelledby="quick-report-label">
      <h3 id="quick-report-label" className="section-label">
        {t(lang, strings.quickReport)}
      </h3>
      <div
        className="chips"
        role="radiogroup"
        aria-labelledby="quick-report-label"
        aria-describedby={status.kind === 'error' ? errorId : undefined}
      >
        {CHIP_VALUES.map((c) => {
          const selected = chip === c
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked}
              className={`chip${selected ? ' selected' : ''}${showChipError ? ' invalid' : ''}`}
              onClick={() => {
                setChip(selected ? null : c)
                if (status.kind === 'error') setStatus({ kind: 'idle' })
              }}
            >
              {CHIP_LABEL[c]}
              {selected && <span aria-hidden="true"> ✓</span>}
            </button>
          )
        })}
      </div>

      <label className="section-label" htmlFor="report-note">
        {t(lang, strings.noteLabel)}
      </label>
      <input
        id="report-note"
        className="text-field"
        type="text"
        maxLength={MAX_NOTE_LENGTH + 20}
        placeholder={t(lang, strings.notePlaceholder)}
        value={text}
        disabled={locked}
        onChange={(e) => setText(e.target.value)}
      />

      {status.kind === 'error' && (
        <p id={errorId} className="error" role="alert">
          {status.message}
        </p>
      )}

      {status.kind === 'sent' ? (
        <div className="sent" role="status">
          <strong>{t(lang, strings.sent)}</strong>
          <span>
            {status.at} · {t(lang, strings.sentDetail)}
          </span>
          <button type="button" className="btn secondary" onClick={reset}>
            {t(lang, strings.newReport)}
          </button>
        </div>
      ) : status.kind === 'queued' ? (
        <div className="sent queued" role="status">
          <strong>{t(lang, outboxStrings.queuedTitle)}</strong>
          <span>{t(lang, outboxStrings.queuedReport)}</span>
          <button type="button" className="btn secondary" onClick={reset}>
            {t(lang, strings.newReport)}
          </button>
        </div>
      ) : (
        <button type="button" className="btn primary" disabled={status.kind === 'sending'} onClick={() => void send()}>
          {status.kind === 'sending'
            ? t(lang, strings.sending)
            : status.kind === 'error' && status.retryable
              ? t(lang, strings.retry)
              : t(lang, strings.sendReport)}
        </button>
      )}
    </section>
  )
}

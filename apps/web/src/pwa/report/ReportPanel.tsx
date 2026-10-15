import { useEffect, useRef, useState } from 'react'
import type { ChipValue, ObservationCreate } from '../contracts/types'
import type { EmberApi } from '../api/types'
import { strings, t, type Lang } from '../i18n'
import { outboxStrings } from '../outbox/strings'
import { MAX_NOTE_LENGTH } from './buildObservation'
import { ChipRow } from './ChipRow'
import type { LocationResult } from './location'
import { sendReport } from './sendReport'
import { statusLine, type ReportStatus } from './status'

interface Props {
  api: EmberApi
  lang: Lang
  /** Asks the browser for the position. Waits while the permission prompt is open. */
  locate: () => Promise<LocationResult>
  /** Calls back when location becomes allowed in the browser. Returns a function that stops listening. */
  onLocationGranted?: (callback: () => void) => () => void
  /** Pre-select a chip from the task card ("Not a fire" → aman). `n` changes on each request. */
  preset?: { chip: ChipValue | null; n: number }
  /** Sends through the offline outbox (#21). Without it the report goes straight to POST /observations. */
  submit?: (body: ObservationCreate) => Promise<'sent' | 'queued'>
}

/** #17: chip and text report. Works without Live voice. */
export function ReportPanel({ api, lang, locate, onLocationGranted, preset, submit }: Props) {
  const [chip, setChip] = useState<ChipValue | null>(null)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<ReportStatus>({ kind: 'idle' })
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
  const busy = status.kind === 'locating' || status.kind === 'sending'
  const locked = busy || status.kind === 'sent' || status.kind === 'queued' || (status.kind === 'error' && status.retryable)
  const errorId = 'report-error'

  async function send() {
    if (busy) return
    const capturedAt = pending.current?.capturedAt ?? new Date().toISOString()
    const draft = { chip, text, capturedAt }
    pending.current ??= { capturedAt }
    const outcome = await sendReport(draft, {
      locate,
      submit,
      create: (body) => api.createObservation(body),
      onPhase: (phase) => setStatus({ kind: phase }),
    })
    switch (outcome.kind) {
      case 'invalid':
        pending.current = null
        setStatus({ kind: 'error', retryable: false, message: t(lang, outcome.reason === 'empty' ? strings.errEmpty : strings.errTooLong) })
        return
      case 'no-location':
        // lat and lng are required by ember-api; keep the draft so the volunteer can send again.
        pending.current = null
        setStatus({
          kind: 'error',
          retryable: false,
          location: outcome.reason,
          message: t(lang, outcome.reason === 'denied' ? strings.locationBlocked : strings.noLocation),
        })
        return
      case 'queued':
        setStatus({ kind: 'queued' })
        return
      case 'sent':
        setStatus({
          kind: 'sent',
          at: new Date().toLocaleTimeString(lang === 'id' ? 'id-ID' : 'en-GB', { hour: '2-digit', minute: '2-digit' }),
        })
        return
      case 'failed':
        if (!outcome.retryable) pending.current = null
        setStatus({
          kind: 'error',
          retryable: outcome.retryable,
          message: outcome.retryable ? t(lang, strings.errNetwork) : `${t(lang, strings.errApi)} ${outcome.detail}`,
        })
    }
  }

  // After "location blocked", sending again as soon as the volunteer allows it clears the error and the report goes out.
  const sendRef = useRef(send)
  sendRef.current = send
  const noLocation = status.kind === 'error' && status.location !== undefined
  useEffect(() => {
    if (!noLocation || !onLocationGranted) return
    return onLocationGranted(() => void sendRef.current())
  }, [noLocation, onLocationGranted])

  function reset() {
    pending.current = null
    setChip(null)
    setText('')
    setStatus({ kind: 'idle' })
  }

  const showChipError = status.kind === 'error' && !status.retryable && !status.location && !chip && !text.trim()
  const line = statusLine(status, lang)

  return (
    <section className="card report" aria-labelledby="quick-report-label">
      <h3 id="quick-report-label" className="section-label">
        {t(lang, strings.quickReport)}
      </h3>
      <ChipRow
        lang={lang}
        value={chip}
        disabled={locked}
        invalid={showChipError}
        labelledBy="quick-report-label"
        describedBy={status.kind === 'error' ? errorId : undefined}
        onChange={(next) => {
          setChip(next)
          if (status.kind === 'error') setStatus({ kind: 'idle' })
        }}
      />

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
        <>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void send()}>
            {status.kind === 'locating'
              ? t(lang, strings.waitingForLocation)
              : status.kind === 'sending'
                ? t(lang, strings.sending)
                : status.kind === 'error' && status.retryable
                  ? t(lang, strings.retry)
                  : t(lang, strings.sendReport)}
          </button>
          <p id={errorId} className={`report-status ${line.tone}`} aria-live="polite">
            {line.tone === 'busy' && <span className="report-spinner" aria-hidden="true" />}
            {line.text}
          </p>
        </>
      )}
    </section>
  )
}

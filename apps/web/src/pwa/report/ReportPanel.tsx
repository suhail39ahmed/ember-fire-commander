import { useEffect, useRef, useState } from 'react'
import type { ChipValue, ObservationCreate, SentReport } from '../contracts/types'
import type { EmberApi } from '../api/types'
import { clockMessage, stampNow } from '../clock'
import { strings, t, type Lang } from '../i18n'
import { MAX_NOTE_LENGTH } from './buildObservation'
import { ChipRow } from './ChipRow'
import { SentCard } from './SentCard'
import { SentToday } from './SentToday'
import { addSent, loadSentToday, updateSent, type SentEntry } from './sentLog'
import { sentRows } from './sentRows'
import { startOfLocalDay } from './dayStart'
import { useDeviceFacts } from './deviceInfo'
import { useJoinWatch, type WatchedReport } from './useJoinWatch'
import { joinResultOf, type JoinResult } from './joinResult'
import type { LocationResult } from './location'
import { clearDraft, loadDraft, saveDraft } from './draft'
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
  taskId?: string
  /** Sends through the offline outbox (#21). Without it the report goes straight to POST /observations. */
  submit?: (body: ObservationCreate) => Promise<'sent' | 'queued'>
  /** Whose draft this is. Without it nothing is kept between visits. */
  volunteerId?: string | null
  /** Done on the success card. Without it there is no Done button. */
  onDone?: () => void
}

const signatureOf = (chip: ChipValue | null, text: string) => `${chip ?? ''}|${text}`
const EMPTY_SIGNATURE = signatureOf(null, '')

/** #17: chip and text report. Works without Live voice. */
export function ReportPanel({ api, lang, locate, onLocationGranted, preset, taskId, submit, volunteerId = null, onDone }: Props) {
  // A draft left by this volunteer within the last hour comes back after a reload or a closed app (#160).
  const [restored] = useState(() => (volunteerId ? loadDraft(volunteerId) : null))
  const [chip, setChip] = useState<ChipValue | null>(restored?.chip ?? null)
  const [text, setText] = useState(restored?.text ?? '')
  const savedAs = useRef(restored ? signatureOf(restored.chip, restored.text) : EMPTY_SIGNATURE)
  const [status, setStatus] = useState<ReportStatus>({ kind: 'idle' })
  // capturedAt is fixed when the report is first sent and reused on retry.
  const pending = useRef<{ capturedAt: string } | null>(null)
  const statusRef = useRef(status)
  statusRef.current = status
  const accuracy = useRef<number | null>(null)
  const [today, setToday] = useState<SentEntry[]>(() => (volunteerId ? loadSentToday(volunteerId) : []))
  const [join, setJoin] = useState<JoinResult | null>(null)
  // What ember-api lists for today, once it has answered. Null until then and when it cannot be read.
  const [remote, setRemote] = useState<SentReport[] | null>(null)
  const deviceFacts = useDeviceFacts(lang)

  // The phone's own record is shown at once; ember-api's list replaces each row it has (#131).
  useEffect(() => {
    if (!volunteerId) return
    let live = true
    api
      .getDigest(null, { sentSince: startOfLocalDay() })
      .then((digest) => live && setRemote(digest.sentToday ?? null))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [api, volunteerId])

  const watched: WatchedReport | null =
    status.kind === 'sent' && volunteerId ? { volunteerId, capturedAt: status.capturedAt, sentSince: startOfLocalDay(new Date(status.at)) } : null
  useJoinWatch({
    api,
    report: watched,
    onFound: (row, all) => {
      setRemote(all)
      if (!row.join) return
      const found = joinResultOf(row.join, lang)
      setJoin(found)
      if (status.kind === 'sent' && volunteerId) setToday(updateSent(volunteerId, status.at, { join: found }))
    },
  })

  // Keep the draft as it changes. The restored draft is not saved again, so reopening never makes it look newer.
  useEffect(() => {
    if (!volunteerId) return
    const signature = signatureOf(chip, text)
    if (signature === savedAs.current) return
    savedAs.current = signature
    saveDraft(volunteerId, { chip, text })
  }, [chip, text, volunteerId])

  useEffect(() => {
    if (!preset || preset.n === 0) return
    const s = statusRef.current
    const finished = s.kind === 'sent' || s.kind === 'queued'
    if (s.kind === 'idle' || finished || (s.kind === 'error' && !s.retryable)) {
      // A finished report is closed, so a new request ("Not a fire") starts a fresh draft.
      if (finished) {
        pending.current = null
        setText('')
      }
      setChip(preset.chip)
      setStatus({ kind: 'idle' })
    }
  }, [preset])

  // Inputs lock while a report is in flight or awaiting retry, so a retry sends the same report.
  const busy = status.kind === 'locating' || status.kind === 'sending'
  const locked = busy || (status.kind === 'error' && status.retryable)
  const hasDraft = chip !== null || text.trim() !== ''
  const errorId = 'report-error'

  async function send() {
    if (busy) return
    const capturedAt = pending.current?.capturedAt ?? stampNow()
    const draft = { chip, text, capturedAt, device: deviceFacts() }
    pending.current ??= { capturedAt }
    const outcome = await sendReport(draft, {
      locate,
      submit: submit ? (body) => submit(taskId ? { ...body, taskId } : body) : undefined,
      create: (body) => api.createObservation(taskId ? { ...body, taskId } : body),
      onPhase: (phase) => setStatus({ kind: phase }),
      onPosition: (pos) => {
        accuracy.current = pos.accuracyM
      },
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
      case 'sent':
        // The success card takes the form's place and shows what was sent; the form starts empty again.
        {
          const at = new Date().toISOString()
          setStatus({ kind: outcome.kind, at, capturedAt, chip, text })
          setJoin(null)
          if (volunteerId) {
            setToday(addSent(volunteerId, { at, capturedAt, kind: outcome.kind, chip, text, accuracyM: accuracy.current, join: null }))
          }
        }
        pending.current = null
        clearDraft()
        savedAs.current = EMPTY_SIGNATURE
        setChip(null)
        setText('')
        return
      case 'failed':
        if (!outcome.retryable) pending.current = null
        setStatus({
          kind: 'error',
          retryable: outcome.retryable,
          message: outcome.retryable
            ? t(lang, strings.errNetwork)
            : outcome.clock
              ? clockMessage(lang)
              : `${t(lang, strings.errApi)} ${outcome.detail}`,
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
    setJoin(null)
    clearDraft()
    savedAs.current = EMPTY_SIGNATURE
    setChip(null)
    setText('')
    setStatus({ kind: 'idle' })
  }

  const showChipError = status.kind === 'error' && !status.retryable && !status.location && !chip && !text.trim()
  const line = statusLine(status, lang, hasDraft)

  const title = (
    <h3 id="quick-report-label" className="vol-sr-only">
      {t(lang, strings.quickReport)}
    </h3>
  )

  if (status.kind === 'sent' || status.kind === 'queued') {
    return (
      <>
        <section className="card report" aria-labelledby="quick-report-label">
          {title}
          <SentCard
            lang={lang}
            kind={status.kind}
            at={status.at}
            chip={status.chip}
            text={status.text}
            onNew={reset}
            onDone={onDone}
            join={join}
          />
        </section>
        <SentToday lang={lang} rows={sentRows(today, remote, lang)} />
      </>
    )
  }

  return (
    <section className="card report" aria-labelledby="quick-report-label">
      {title}
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

      <button type="button" className="btn primary" disabled={busy || !hasDraft} onClick={() => void send()}>
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
    </section>
  )
}

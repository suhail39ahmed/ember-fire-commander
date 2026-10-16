import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '../api/types'
import { DECLINE_REASONS, type DeclineReason } from '../contracts/types'
import { t, type Lang } from '../i18n'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { findTask } from './incidentsView'
import { screenStrings } from './strings'
import type { ActionState } from './actionState'

const s = screenStrings
const NOTE_MAX = 300

/** Can't do it (#137): one reason from the list, an optional note, and a way out for someone who is hurt. */
export function DeclineView({
  lang,
  instruction,
  reason,
  note,
  action,
  alreadyDeclined,
  onReason,
  onNote,
  onSend,
  onBack,
}: {
  lang: Lang
  instruction: string | null
  reason: DeclineReason | null
  note: string
  action: ActionState
  alreadyDeclined: boolean
  onReason: (reason: DeclineReason) => void
  onNote: (note: string) => void
  onSend: () => void
  onBack: () => void
}) {
  const busy = action.kind === 'busy'
  return (
    <>
      <div className="screen-head">
        <button type="button" className="back" onClick={onBack} aria-label={t(lang, s.common.back)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <h2>{t(lang, s.decline.title)}</h2>
      </div>
      <section className="card" aria-label={t(lang, s.decline.lead)}>
        <p className="section-label">{t(lang, s.decline.lead)}</p>
        <p data-testid="decline-instruction">{instruction || t(lang, s.task.noInstruction)}</p>
      </section>

      {alreadyDeclined ? (
        <p className="notice" role="status" data-testid="decline-done">{t(lang, s.task.declinedDone)}</p>
      ) : (
        <>
          <fieldset className="choices">
            <legend className="section-label">{t(lang, s.decline.why)}</legend>
            {DECLINE_REASONS.map((value) => (
              <label key={value} className="choice">
                <input type="radio" name="decline-reason" value={value} checked={reason === value} onChange={() => onReason(value)} />
                <span>{t(lang, s.decline.reasons[value])}</span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span className="section-label">{t(lang, s.decline.noteLabel)}</span>
            <textarea className="text-field" rows={3} maxLength={NOTE_MAX} value={note} placeholder={t(lang, s.decline.notePlaceholder)} onChange={(e) => onNote(e.target.value)} />
          </label>
          <button type="button" className="btn primary" disabled={reason === null || busy} onClick={onSend} data-testid="decline-send">
            {busy ? t(lang, s.decline.sending) : t(lang, s.decline.send)}
          </button>
          {action.kind === 'failed' && <p className="error" role="alert">{t(lang, s.task.saveFailed)}</p>}
          <Link className="btn secondary report-cta" to="/pwa/report" state={{ chip: 'butuh_bantuan', n: 1 }} data-testid="decline-hurt">
            {t(lang, s.decline.hurt)}
          </Link>
          <p className="muted small">{t(lang, s.decline.hurtNote)}</p>
        </>
      )}
    </>
  )
}

export function DeclineScreen() {
  const { lang } = useLanguage()
  const { api, digest, refresh } = useVolunteer()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const task = findTask(digest, id)
  const [reason, setReason] = useState<DeclineReason | null>(null)
  const [note, setNote] = useState('')
  const [action, setAction] = useState<ActionState>({ kind: 'idle' })
  const back = () => navigate(`/pwa/task/${encodeURIComponent(id)}`, { replace: true })

  const send = () => {
    if (!reason) return
    setAction({ kind: 'busy' })
    api
      .declineTask(id, reason, note)
      .then(() => {
        refresh()
        back()
      })
      .catch((error: unknown) => {
        // A 409 means the task is no longer open to answer; the on-the-fire screen shows where it stands.
        if (error instanceof ApiError && error.status === 409) back()
        else setAction({ kind: 'failed' })
      })
  }

  return (
    <DeclineView
      lang={lang}
      instruction={task?.instruction ?? null}
      reason={reason}
      note={note}
      action={action}
      alreadyDeclined={Boolean(task?.declinedAt)}
      onReason={setReason}
      onNote={setNote}
      onSend={send}
      onBack={back}
    />
  )
}

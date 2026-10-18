import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/types'
import type { Task } from '../contracts/types'
import { t, type Lang } from '../i18n'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { findTask } from './incidentsView'
import { screenStrings as s } from './strings'
import type { ActionState } from './actionState'

type Response = NonNullable<Task['acceptResponse']>

export function AcceptView({ lang, instruction, response, note, action, onResponse, onNote, onSend, onBack }: {
  lang: Lang
  instruction: string | null
  response: Response | null
  note: string
  action: ActionState
  onResponse: (response: Response) => void
  onNote: (note: string) => void
  onSend: () => void
  onBack: () => void
}) {
  const busy = action.kind === 'busy'
  return <>
    <div className="screen-head">
      <button type="button" className="back" onClick={onBack} aria-label={t(lang, s.common.back)}>←</button>
      <h2>{t(lang, s.accept.title)}</h2>
    </div>
    <section className="card" aria-label={t(lang, s.accept.lead)}>
      <p className="section-label">{t(lang, s.accept.lead)}</p>
      <p>{instruction || t(lang, s.task.noInstruction)}</p>
    </section>
    <fieldset className="choices" disabled={busy}>
      <legend className="section-label">{t(lang, s.accept.progress)}</legend>
      {(['on_my_way', 'starting_now'] as const).map((value) => <label className="choice" key={value}>
        <input type="radio" name="accept-response" value={value} checked={response === value} onChange={() => onResponse(value)} />
        <span>{t(lang, s.accept.responses[value])}</span>
      </label>)}
    </fieldset>
    <label className="field">
      <span className="section-label">{t(lang, s.decline.noteLabel)}</span>
      <textarea className="text-field" rows={3} maxLength={300} value={note} disabled={busy} placeholder={t(lang, s.decline.notePlaceholder)} onChange={(e) => onNote(e.target.value)} />
    </label>
    <button type="button" className="btn primary" disabled={busy} onClick={onSend} data-testid="accept-send">{t(lang, busy ? s.decline.sending : s.decline.send)}</button>
    {action.kind === 'failed' && <p className="error" role="alert">{t(lang, s.task.saveFailed)}</p>}
  </>
}

export function AcceptScreen() {
  const { lang } = useLanguage()
  const { api, digest, refresh } = useVolunteer()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const task = findTask(digest, id)
  const [response, setResponse] = useState<Response | null>(null)
  const [note, setNote] = useState('')
  const [action, setAction] = useState<ActionState>({ kind: 'idle' })
  const sending = useRef(false)
  const back = () => navigate(`/pwa/task/${encodeURIComponent(id)}`, { replace: true })

  if (!task || task.status !== 'approved' || task.type === 'withdraw') return <section className="card" role="status"><h3>{t(lang, s.task.notFoundTitle)}</h3><Link to="/pwa/incidents" className="btn secondary">{t(lang, s.incidents.backToList)}</Link></section>
  if (task.acceptedAt || task.declinedAt) return <><p className="notice" role="status">{t(lang, task.declinedAt ? s.task.declinedDone : s.task.doingItDone)}</p><button className="btn secondary" onClick={back}>{t(lang, s.common.back)}</button></>

  const send = async () => {
    if (sending.current) return
    sending.current = true
    setAction({ kind: 'busy' })
    try {
      await api.acceptTask(id, response, note)
      refresh()
      back()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) { refresh(); back() }
      else setAction({ kind: 'failed' })
    } finally {
      sending.current = false
    }
  }
  return <AcceptView lang={lang} instruction={task.instruction} response={response} note={note} action={action} onResponse={setResponse} onNote={setNote} onSend={() => void send()} onBack={back} />
}

import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { callIsOpen, useIncidentCall, type CallSnapshot, type CallController } from '../../livekit/calls'
import { formatTime } from '../../pwa/formatTime'
import { initialsOf } from './model'
import { popupFor, batteryText, networkText } from './popupModel'
import { sendBlock, instructionFailure } from './instructionModel'
import { AskThread, SentArea, SnapshotsArea, type ChatEntry, type ExpandedVolunteerViewProps } from './ExpandedVolunteerView'
import type { DetailSuggestions, AskAnswer } from '../contracts'
import { USE_MOCK_API } from '../../pwa/api/config'
import '../../livekit/incidentCall.css'

const Media = lazy(() => import('../../livekit/IncidentCallMedia'))
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]'

export default function IncidentCallPopup(props: ExpandedVolunteerViewProps) {
  const controller = useIncidentCall(props.detail.incident.id, props.volunteerId)
  return <IncidentCallPopupView {...props} controller={controller} />
}

export function IncidentCallPopupView({ lang, detail, volunteerId, onClose, offline, sendInstruction, photoUrl, videoUrl, assist, controller }: ExpandedVolunteerViewProps & { controller: CallController }) {
  const { call, request } = controller
  const popup = popupFor(detail, volunteerId, lang)
  const [tab, setTab] = useState<'ai' | 'chat'>('ai')
  const [question, setQuestion] = useState('')
  const [message, setMessage] = useState('')
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [suggestions, setSuggestions] = useState<DetailSuggestions['items']>(detail.suggestions?.items ?? [])
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<string[]>([])
  const [error, setError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [clock, setClock] = useState(Date.now())
  const [snapshots, setSnapshots] = useState<CallSnapshot[]>([])
  const [snapshotRevision, setSnapshotRevision] = useState(0)
  const [photo, setPhoto] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(() => {})
  const block = sendBlock(detail, volunteerId, false)
  const close = () => callIsOpen(call) ? setConfirmClose(true) : onClose()
  closeRef.current = () => photo ? setPhoto(null) : confirmClose ? setConfirmClose(false) : close()

  useEffect(() => {
    const modal = panel.current?.querySelector<HTMLElement>('.call-confirm, .call-photo-preview')
    modal?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    panel.current?.querySelectorAll<HTMLElement>('.call-popup-left, .call-popup-right').forEach((element) => { element.inert = !!modal })
  }, [confirmClose, photo])

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const scope = panel.current?.querySelector('.call-confirm, .call-photo-preview') ?? panel.current
      const elements = scope?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!elements?.length) return
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); opener?.focus() }
  }, [])
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  useEffect(() => {
    if (USE_MOCK_API) return
    let disposed = false
    const refresh = () => void request<{ items: CallSnapshot[] }>(`/incidents/${detail.incident.id}/call-snapshots`).then((value) => {
      if (!disposed) setSnapshots(value.items.filter((item) => (item.requestedVolunteerId ?? item.volunteerId) === volunteerId))
    }).catch(() => { /* Existing uploaded media remains available when snapshot reads fail. */ })
    refresh()
    const timer = window.setInterval(refresh, 240000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [detail.incident.id, volunteerId, request, snapshotRevision])

  async function ask(text = question) {
    if (!assist || busy || !text.trim() || offline) return
    setBusy(true); setError('')
    try {
      const answer = call && !USE_MOCK_API
        ? await request<AskAnswer>(`/incidents/${detail.incident.id}/ask`, 'POST', { question: text.trim(), volunteerId, callId: call.id })
        : await assist.ask(text.trim(), volunteerId)
      setEntries((old) => [...old, { id: Date.now(), question: text.trim(), answer }]); setQuestion('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Ember AI is unavailable.') }
    finally { setBusy(false) }
  }
  async function suggest() {
    if (!assist || busy || offline) return
    setBusy(true); setError('')
    try {
      const result = call && !USE_MOCK_API
        ? await request<DetailSuggestions>(`/incidents/${detail.incident.id}/suggestions`, 'POST', { volunteerId, callId: call.id })
        : await assist.suggest()
      setSuggestions(result.items)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not generate suggestions.') }
    finally { setBusy(false) }
  }
  async function send(text: string) {
    if (sending || offline || block || !text.trim()) return
    setSending(text); setError('')
    try {
      await sendInstruction(volunteerId, text.trim())
      setSent((old) => [...old, text.trim()]); setMessage('')
    } catch (err) { setError(instructionFailure(err, lang)) }
    finally { setSending(null) }
  }
  if (!popup) return <div className="exp-backdrop"><div className="call-popup"><p>This volunteer is no longer on this incident.</p><button type="button" onClick={close}>Close</button></div></div>
  const name = popup.profile.name
  const pending = call?.status === 'requested'
  const accepted = call?.status === 'connecting' || call?.status === 'active'
  const seconds = call ? Math.min(45, Math.max(0, Math.ceil((Date.parse(call.expiresAt) - clock) / 1000))) : 0
  return <div className="exp-backdrop call-popup-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
    <div className="call-popup" role="dialog" aria-modal="true" aria-labelledby="call-popup-title" ref={panel}>
      <div className="call-popup-left">
        {controller.credentials ? <Suspense fallback={<p>Connecting…</p>}><Media controller={controller} onSnapshot={async (blob) => {
          await request(`/calls/${call!.id}/snapshots`, 'POST', blob); setSnapshotRevision((value) => value + 1)
        }} /></Suspense> : <>
          <div className="incident-video-stage"><div className="incident-video-placeholder">
            {pending && <span className="call-wait-spinner" aria-hidden="true" />}
            <span className="call-state-label">{pending ? `REQUESTED ${formatTime(call!.createdAt)} · EXPIRES IN ${seconds}s` : accepted ? 'CONNECTING' : 'NOT LIVE'}</span>
            <strong>{pending ? `Waiting for ${name} to accept` : accepted ? 'Connecting the call…' : `${name}’s camera is off`}</strong>
            <p>{pending ? 'They see a prompt in their app. Nothing starts until they join.' : 'They get a prompt in their app and choose when to share their camera.'}</p>
            {pending ? <button type="button" className="call-cancel" disabled={controller.busy} onClick={() => void controller.end('cancelled')}>Cancel request</button>
              : accepted ? <button type="button" className="call-cancel" onClick={() => void controller.end()}>End call</button>
                : <button type="button" className="call-request" disabled={offline || controller.busy || USE_MOCK_API} onClick={() => void controller.start()}>{controller.busy ? 'Requesting…' : 'Request live video'}</button>}
          </div></div>
          <div className="incident-call-controls"><button type="button" disabled>Mic off · Available after joining</button></div>
          <div className="incident-transcript transcript-placeholder"><h3>LIVE TRANSCRIPTION · GEMINI · CHECK IT YOURSELF</h3><p>Starts when {name} accepts and the call connects.</p></div>
        </>}
        {controller.error && <p role="alert" className="call-error">{controller.error}</p>}
        {callIsOpen(call) && call?.joinCode && <div className="call-code-invite"><p>You can also ask {name} to join this call by entering the code</p><code>{call.joinCode}</code><p>Any signed-in volunteer can use this code for testing.{pending ? ` Invitation expires in ${seconds}s.` : ''}</p>{call.volunteerId !== volunteerId && <p><strong>Test call joined by {call.volunteerName}.</strong> Written instructions in this panel still go to {name}.</p>}</div>}
        {call && !callIsOpen(call) && <p role="status" className="call-outcome">Call {call.status}{call.endReason === 'connection_lost' ? ' · Connection lost' : ''}.</p>}
        {pending && call?.notification !== 'sent' && <p className="call-outcome">Push notification {call?.notification === 'skipped' ? 'is unavailable' : 'could not be sent'}. The invitation appears when the volunteer opens EMBER.</p>}
        <SnapshotsArea lang={lang} popup={popup} incidentId={detail.incident.id} photoUrl={photoUrl} videoUrl={videoUrl} />
        {snapshots.length > 0 && <section className="call-snapshots"><h3>CALL SNAPSHOTS · SAVED TO THE INCIDENT</h3><ul>{snapshots.map((item) => <li key={item.id}>
          <button type="button" onClick={() => setPhoto(item.url)}><img src={item.url} alt={`Call snapshot of ${name}`} /></button><span>{formatTime(item.capturedAt)} · SNAPSHOT</span>
        </li>)}</ul></section>}
        <SentArea lang={lang} popup={popup} />
      </div>
      <div className="call-popup-right">
        <header className="call-popup-header"><span className="exp-avatar">{initialsOf(name)}</span><div><h2 id="call-popup-title">{name}{popup.profile.role ? ` · ${popup.profile.role}` : ''}</h2>
          <p>{[popup.profile.distance, networkText(popup.profile), batteryText(popup.profile.device)].filter(Boolean).join(' · ') || 'Incident volunteer'}</p></div>
          <button className="call-close" type="button" aria-label="Close volunteer" onClick={close}>×</button></header>
        <div className="call-tabs" role="tablist" aria-label="Volunteer communication">
          <button type="button" role="tab" aria-selected={tab === 'ai'} onClick={() => setTab('ai')}>EMBER AI</button>
          <button type="button" role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>Chat with {name.split(' ')[0]}</button>
        </div>
        <div className="call-tab-panel" role="tabpanel" aria-label={tab === 'ai' ? 'Ember AI' : `Chat with ${name}`}>
          {tab === 'ai' ? <>
            <div className="call-ai-title"><h3>Ask EMBER AI about {name}</h3><span>SENDS ONLY WHEN YOU TAP</span></div>
            <AskThread lang={lang} entries={entries} />
            <section className="call-suggestions"><div className="call-suggestions-title"><h3>AI SUGGESTED · TAP SEND TO DELIVER</h3><button type="button" disabled={!assist || busy || offline} onClick={() => void suggest()}>{busy ? '…' : 'Refresh'}</button></div>
              {suggestions.length ? <ul>{suggestions.map((item) => <li key={item.text}><span title={item.rationale ?? undefined}>{item.text}</span><button type="button" disabled={!!sending || offline || !!block || sent.includes(item.text)} onClick={() => void send(item.text)}>{sent.includes(item.text) ? 'Sent ✓' : sending === item.text ? '…' : 'Send'}</button></li>)}</ul> : <p className="call-empty">Ask Ember for suggestions using the incident reports and available call transcript.</p>}
            </section>
            <div className="exp-prompts">{['What next?', 'Summarise last 5 min', 'Draft for everyone'].map((label) => <button type="button" className="exp-prompt-btn" key={label} disabled={!assist || busy || offline} onClick={() => void ask(label)}>{label}</button>)}</div>
            <form className="call-composer" onSubmit={(e) => { e.preventDefault(); void ask() }}><input aria-label="Ask Ember AI" placeholder="Ask EMBER about this volunteer…" maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} disabled={!assist || busy || offline} /><button type="submit" aria-label="Ask Ember" disabled={!assist || busy || offline || !question.trim()}>↑</button></form>
          </> : <>
            <div className="call-ai-title"><h3>Messages to {name}</h3><span>SUPERVISOR → VOLUNTEER</span></div>
            <div className="call-message-history"><SentArea lang={lang} popup={popup} />{sent.length > 0 && <p role="status">Latest message sent. Delivery status updates in the history.</p>}</div>
            <form className="call-composer" onSubmit={(e) => { e.preventDefault(); void send(message) }}><textarea aria-label={`Message to ${name}`} placeholder={`Send an instruction to ${name}…`} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} disabled={offline || !!sending || !!block} /><button type="submit" aria-label="Send message" disabled={offline || !!sending || !!block || !message.trim()}>↑</button></form>
          </>}
          {block && <p className="call-error">Sending is unavailable while this volunteer is under WITHDRAW or the incident is closed.</p>}
          {error && <p className="call-error" role="alert">{error}</p>}
          <p className="call-withdraw-note">WITHDRAW remains available from the incident controls.</p>
        </div>
      </div>
      {confirmClose && <div className="call-confirm" role="alertdialog" aria-modal="true" aria-labelledby="call-confirm-title"><div><h3 id="call-confirm-title">End the call and close?</h3><p>This stops camera, audio, and transcription for both participants.</p><button type="button" onClick={() => setConfirmClose(false)}>Keep call open</button><button type="button" className="call-end" disabled={controller.busy} onClick={() => void controller.end(pending ? 'cancelled' : 'ended').then((ended) => { if (ended) onClose() })}>End and close</button></div></div>}
      {photo && <div className="call-photo-preview" role="dialog" aria-label="Incident snapshot"><img src={photo} alt="Incident call snapshot" /><button type="button" onClick={() => setPhoto(null)}>Close photo</button></div>}
    </div>
  </div>
}

import { useEffect, useRef, useState } from 'react'

import { formatTime, formatTimeZone } from '../../pwa/formatTime'
import { chipText } from '../../pwa/report/chips'
import { t, type Lang } from '../../pwa/i18n'
import { ApiError } from '../../pwa/api/types'
import type { AskAnswer, IncidentDetail, PhotoUrl, TaskDecision } from '../contracts'
import { severityName, taskCopy } from './copy'
import { expandedCopy } from './expandedCopy'
import { batteryText, networkText, popupFor, type Popup } from './popupModel'
import { worthShowing, ASK_MAX } from './assistModel'
import type { AssistActions } from './assistModel'
import { SnapshotImage } from './SnapshotImage'
import './expanded.css'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** One Q&A pair in the chat thread. */
interface ChatEntry {
  id: number
  question: string
  answer: AskAnswer
}

/** One plain sentence for a failed Ask EMBER call. */
function describeAskError(lang: Lang, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return t(lang, expandedCopy.errSession)
    if (error.status === 404) return t(lang, expandedCopy.errGone)
    if (error.status === null) return t(lang, expandedCopy.errNetwork)
  }
  return t(lang, expandedCopy.errUnavailable)
}

/** The header stat bar: distance, signal, battery — only parts the API has stored. */
function HeaderStats({ lang, popup }: { lang: Lang; popup: Popup }) {
  const p = popup.profile
  const net = networkText(p)
  const bat = batteryText(p.device)
  const parts: Array<{ label: string; value: string }> = []
  if (p.distance) parts.push({ label: t(lang, expandedCopy.distance), value: p.distance })
  if (net) parts.push({ label: t(lang, expandedCopy.signal), value: net })
  if (bat) parts.push({ label: t(lang, expandedCopy.battery), value: bat })
  if (parts.length === 0) return null
  return (
    <div className="exp-header-stats" aria-label="volunteer status">
      {parts.map(({ label, value }) => (
        <span key={label} className="exp-header-stat"><b>{value}</b> {label}</span>
      ))}
    </div>
  )
}

/** Live video placeholder — out of scope until the live seat media path is wired (#102). */
function VideoArea({ lang }: { lang: Lang }) {
  return (
    <div className="exp-section" aria-label={t(lang, expandedCopy.leftTitle)}>
      <p className="exp-eyebrow">
        {t(lang, expandedCopy.leftTitle)}
        <span className="exp-live-badge" aria-label="LIVE">LIVE</span>
      </p>
      <div className="exp-video-box" role="img" aria-label={t(lang, expandedCopy.videoPlaceholder)}>
        <span className="exp-video-off">{t(lang, expandedCopy.notYet).toUpperCase()}</span>
        <p className="exp-video-body">{t(lang, expandedCopy.videoPlaceholder)}</p>
      </div>
      <p className="exp-not-yet">
        <b>{t(lang, expandedCopy.captionTitle)}:</b>{' '}
        {t(lang, expandedCopy.captionPlaceholder)}
      </p>
      <div className="exp-controls" aria-label="live controls">
        {([expandedCopy.mic, expandedCopy.video, expandedCopy.snapshot, expandedCopy.flip, expandedCopy.endLive] as const).map((label) => (
          <button key={label.en} type="button" className="exp-ctrl-btn" disabled aria-label={t(lang, label)}>
            {t(lang, label)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Wind chip — shows stored conditions or a "not available yet" note. */
function WindArea({ lang, detail }: { lang: Lang; detail: IncidentDetail }) {
  const weather = detail.conditions?.weather ?? null
  return (
    <div className="exp-section" aria-label={t(lang, expandedCopy.windChip)}>
      <p className="exp-eyebrow">{t(lang, expandedCopy.windChip)}</p>
      {weather && (weather.windFrom || weather.windKmh !== null) ? (
        <span className="exp-wind-chip">
          {[weather.windFrom, weather.windKmh !== null ? `${Math.round(weather.windKmh)} km/h` : null].filter(Boolean).join(' · ')}
        </span>
      ) : (
        <p className="exp-not-yet"><b>{t(lang, expandedCopy.notYet)}</b> · {t(lang, expandedCopy.windNotYet)}</p>
      )}
    </div>
  )
}

/** Latest message: volunteer's own words plus stored English translation. */
function LatestMessage({ lang, popup }: { lang: Lang; popup: Popup }) {
  const latest = popup.reports[0] ?? null
  return (
    <div className="exp-section" aria-label={t(lang, expandedCopy.latestMsg)}>
      <p className="exp-eyebrow">{t(lang, expandedCopy.latestMsg)}</p>
      {latest ? (
        <>
          <p className="exp-msg-meta">
            {formatTimeZone(latest.capturedAt)} · {t(lang, severityName[latest.severity])}
            {latest.chip && ` · ${chipText(latest.chip, lang)}`}
            {latest.source === 'photo' && ` · ${t(lang, expandedCopy.snapshot)}`}
          </p>
          <p className="exp-msg-text">{latest.text ? `"${latest.text}"` : t(lang, expandedCopy.notYet)}</p>
          {worthShowing(popup.translations[latest.id]) && (
            <p className="exp-msg-en">
              <span>
                {t(lang, expandedCopy.english)}
                {popup.translations[latest.id].sourceLanguage && ` · ${t(lang, expandedCopy.translatedFrom)} ${popup.translations[latest.id].sourceLanguage}`}
              </span>
              &ldquo;{popup.translations[latest.id].english}&rdquo;
            </p>
          )}
        </>
      ) : (
        <p className="exp-muted">{t(lang, expandedCopy.noMsg)}</p>
      )}
    </div>
  )
}

/** Saved snapshots list. */
function SnapshotsArea({ lang, popup, incidentId, photoUrl }: {
  lang: Lang
  popup: Popup
  incidentId: string
  photoUrl(incidentId: string, observationId: string): Promise<PhotoUrl>
}) {
  return (
    <div className="exp-section" aria-label={t(lang, expandedCopy.snapshots)}>
      <p className="exp-eyebrow">{t(lang, expandedCopy.snapshots)}</p>
      {popup.photos.length === 0 ? (
        <p className="exp-muted">{t(lang, expandedCopy.noSnapshots)}</p>
      ) : (
        <ul className="exp-snaps">
          {popup.photos.map((o) => (
            <li key={o.id} className="exp-snap">
              <SnapshotImage lang={lang} observationId={o.id} load={(id) => photoUrl(incidentId, id)} />
              <span>{formatTime(o.capturedAt)} · {popup.profile.name.toUpperCase()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** "Sent to <name>" list with heard/accepted status per task. */
function SentArea({ lang, popup }: { lang: Lang; popup: Popup }) {
  return (
    <div className="exp-section" aria-label={`${t(lang, expandedCopy.sentTitle)} ${popup.profile.name}`}>
      <p className="exp-eyebrow">{t(lang, expandedCopy.sentTitle)} {popup.profile.name}</p>
      {popup.tasks.length === 0 ? (
        <p className="exp-muted">{t(lang, expandedCopy.noSent)}</p>
      ) : (
        <ul className="exp-sent-list">
          {popup.tasks.map((task) => (
            <li key={task.id} className="exp-sent-item">
              <p className="exp-sent-meta">
                {t(lang, taskCopy.type[task.type])}
                {task.sentAt && ` · ${formatTimeZone(task.sentAt)}`}
              </p>
              <p className="exp-sent-text">{task.instruction ?? '—'}</p>
              {task.acceptedAt && (
                <p className="exp-sent-status exp-sent-done">
                  {t(lang, expandedCopy.done)} {t(lang, expandedCopy.heardAt)} {formatTimeZone(task.acceptedAt)}
                </p>
              )}
              {!task.acceptedAt && task.heardAt && (
                <p className="exp-sent-status exp-sent-heard">
                  {t(lang, expandedCopy.heard)} {t(lang, expandedCopy.heardAt)} {formatTimeZone(task.heardAt)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The inline proposal card: draft from the latest Ask answer, explicit send choices. */
function ProposalCard({
  lang,
  name,
  draft,
  offline,
  onSendOnly,
}: {
  lang: Lang
  name: string
  draft: string | null
  offline: boolean
  onSendOnly(text: string): Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSendOnly() {
    if (!draft || busy || offline) return
    setBusy(true)
    setResult(null)
    try {
      await onSendOnly(draft)
      setResult({ ok: true, text: t(lang, expandedCopy.sent) })
    } catch {
      setResult({ ok: false, text: t(lang, expandedCopy.sendError) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="exp-proposal" aria-label={t(lang, expandedCopy.proposalTitle)} role="region">
      <p className="exp-proposal-title">{t(lang, expandedCopy.proposalTitle)}</p>
      {draft ? (
        <p className="exp-proposal-draft">{draft}</p>
      ) : (
        <p className="exp-proposal-empty">{t(lang, expandedCopy.proposalEmpty)}</p>
      )}
      <div className="exp-proposal-actions">
        {/* Send to everyone needs a separate route — not in first pickup scope */}
        <button
          type="button"
          className="exp-proposal-btn"
          disabled
          title={t(lang, expandedCopy.sendBothNote)}
          aria-label={t(lang, expandedCopy.sendBoth)}
        >
          {t(lang, expandedCopy.sendBoth)}
        </button>
        <button
          type="button"
          className="exp-proposal-btn primary"
          disabled={!draft || busy || offline}
          onClick={() => void handleSendOnly()}
          aria-label={`${t(lang, expandedCopy.sendOnly)} ${name}`}
        >
          {busy ? t(lang, expandedCopy.sending) : `${t(lang, expandedCopy.sendOnly)} ${name}`}
        </button>
      </div>
      <p className="exp-proposal-note">{t(lang, expandedCopy.sendBothNote)}</p>
      {result && (
        <p className={`exp-proposal-result ${result.ok ? 'ok' : 'err'}`} role={result.ok ? 'status' : 'alert'}>
          {result.text}
        </p>
      )}
      <p className="exp-proposal-note">{t(lang, expandedCopy.withdrawRule)}</p>
    </div>
  )
}

/** Earlier messages in the thread, collapsed by default. */
function EarlierMessages({ lang, entries }: { lang: Lang; entries: ChatEntry[] }) {
  const [open, setOpen] = useState(false)
  if (entries.length === 0) return null
  return (
    <>
      <button
        type="button"
        className="exp-earlier-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open
          ? `${t(lang, expandedCopy.hideEarlier)} ${entries.length} ${t(lang, expandedCopy.earlierCount)}`
          : `${t(lang, expandedCopy.showEarlier)} ${entries.length} ${t(lang, expandedCopy.earlierCount)}`}
      </button>
      {open && (
        <ol className="exp-earlier-list" aria-label={`${entries.length} ${t(lang, expandedCopy.earlierCount)}`}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <div className="exp-msg-row you">
                <span className="exp-bubble-label">{t(lang, expandedCopy.you)}</span>
                <div className="exp-bubble">{entry.question}</div>
              </div>
              <div className="exp-msg-row ember">
                <span className="exp-bubble-label">{t(lang, expandedCopy.ember)}</span>
                <div className="exp-bubble">
                  {entry.answer.answer}
                  {entry.answer.enoughData === false && (
                    <p className="exp-not-enough">{t(lang, expandedCopy.notEnough)}</p>
                  )}
                </div>
                <span className="exp-bubble-meta">{formatTimeZone(entry.answer.at)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

/** The right pane: chat thread + proposal card + input. The entire pane is Ask EMBER. */
function AskEmberPane({
  lang,
  popup,
  assist,
  offline,
  onSendInstruction,
}: {
  lang: Lang
  popup: Popup
  assist: AssistActions | undefined
  offline: boolean
  onSendInstruction(instruction: string): Promise<TaskDecision>
}) {
  const name = popup.profile.name
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const nextId = useRef(0)
  const threadRef = useRef<HTMLDivElement>(null)
  const trimmed = question.trim()
  const tooLong = trimmed.length > ASK_MAX

  const earlier = entries.length > 1 ? entries.slice(0, entries.length - 1) : []
  const latest = entries.length > 0 ? entries[entries.length - 1] : null
  const proposalDraft = latest?.answer.answer ?? null

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [entries.length])

  async function submit(text?: string) {
    const asked = (text ?? question).trim()
    if (busy || offline || !assist || asked === '' || asked.length > ASK_MAX) return
    if (text !== undefined) setQuestion(asked)
    setBusy(true)
    setErrorMsg(null)
    try {
      const answer = await assist.ask(asked, popup.profile.id)
      const entry: ChatEntry = { id: nextId.current++, question: asked, answer }
      setEntries((prev) => [...prev, entry])
      setQuestion('')
    } catch (err) {
      setErrorMsg(describeAskError(lang, err))
    } finally {
      setBusy(false)
    }
  }

  const canAsk = assist !== undefined && !offline

  return (
    <div className="exp-right" aria-label={t(lang, expandedCopy.chatTitle)}>
      {/* Thread */}
      <div className="exp-thread" ref={threadRef} aria-live="polite" aria-label={t(lang, expandedCopy.chatTitle)}>
        {entries.length === 0 ? (
          <p className="exp-thread-empty">{t(lang, expandedCopy.chatNote)}</p>
        ) : (
          <>
            <EarlierMessages lang={lang} entries={earlier} />
            {latest && (
              <>
                <div className="exp-msg-row you" aria-label={t(lang, expandedCopy.you)}>
                  <span className="exp-bubble-label">{t(lang, expandedCopy.you)}</span>
                  <div className="exp-bubble">{latest.question}</div>
                </div>
                <div className="exp-msg-row ember" aria-label={t(lang, expandedCopy.ember)}>
                  <span className="exp-bubble-label">{t(lang, expandedCopy.ember)}</span>
                  <div className="exp-bubble">
                    {latest.answer.answer}
                    {latest.answer.enoughData === false && (
                      <p className="exp-not-enough">{t(lang, expandedCopy.notEnough)}</p>
                    )}
                  </div>
                  <span className="exp-bubble-meta">{formatTimeZone(latest.answer.at)}</span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Proposal card */}
      <ProposalCard
        lang={lang}
        name={name}
        draft={proposalDraft}
        offline={offline}
        onSendOnly={async (text) => { await onSendInstruction(text) }}
      />

      {/* Ask error */}
      {errorMsg && <p className="exp-ask-error" role="alert">{errorMsg}</p>}

      {/* Input area */}
      <div className="exp-input-area">
        <div className="exp-prompts">
          {([expandedCopy.promptNext, expandedCopy.promptRecap, expandedCopy.promptAll] as const).map((label) => (
            <button
              key={label.en}
              type="button"
              className="exp-prompt-btn"
              disabled={!canAsk || busy}
              onClick={() => void submit(t(lang, label))}
            >
              {t(lang, label)}
            </button>
          ))}
        </div>
        <div className="exp-input-row">
          <input
            className="exp-input"
            value={question}
            maxLength={ASK_MAX + 50}
            placeholder={
              canAsk
                ? t(lang, expandedCopy.inputPlaceholder)
                : offline
                  ? t(lang, expandedCopy.offline)
                  : t(lang, expandedCopy.chatNote)
            }
            aria-label={t(lang, expandedCopy.inputPlaceholder)}
            disabled={!canAsk || busy}
            onChange={(e) => { setQuestion(e.target.value); setErrorMsg(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) void submit() }}
          />
          <button
            type="button"
            className="exp-send-btn"
            disabled={!canAsk || busy || trimmed === '' || tooLong}
            onClick={() => void submit()}
            aria-label={t(lang, expandedCopy.sendBtn)}
          >
            {busy ? t(lang, expandedCopy.asking) : t(lang, expandedCopy.sendBtn)}
          </button>
        </div>
        <p className="exp-withdraw-rule">{t(lang, expandedCopy.withdrawRule)}</p>
      </div>
    </div>
  )
}

export interface ExpandedVolunteerViewProps {
  lang: Lang
  detail: IncidentDetail
  volunteerId: string
  /** Close returns to the incident detail. It writes nothing. */
  onClose(): void
  offline: boolean
  now: number
  /** POST /incidents/{id}/volunteers/{volunteerId}/instruct, then a fresh read. */
  sendInstruction(volunteerId: string, instruction: string): Promise<TaskDecision>
  /** GET /incidents/{id}/photos/{observationId}: a short-lived signed read link. */
  photoUrl(incidentId: string, observationId: string): Promise<PhotoUrl>
  /** Ask EMBER and English translations. Without it, the right pane shows the chat is not connected. */
  assist?: AssistActions
}

/**
 * Two-pane expanded view for one volunteer. Opens over the incident detail; the detail stays visible
 * behind the backdrop. Left: live video placeholder and field reports. Right: full Ask EMBER chat.
 * Nothing is sent without an explicit supervisor choice. WITHDRAW is never delayed or blocked here.
 */
export function ExpandedVolunteerView({ lang, detail, volunteerId, onClose, offline, sendInstruction, photoUrl, assist }: ExpandedVolunteerViewProps) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const node = panel.current
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); opener?.focus() }
  }, [])

  const popup = popupFor(detail, volunteerId, lang)

  if (!popup) {
    return (
      <div className="exp-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <div ref={panel} className="exp-panel" role="dialog" aria-modal="true" aria-label={t(lang, expandedCopy.close)}>
          <header className="exp-header">
            <p className="exp-header-name" id="exp-title">{t(lang, expandedCopy.notYet)}</p>
            <button type="button" className="exp-close" onClick={onClose}>{t(lang, expandedCopy.closeShort)}</button>
          </header>
          <div style={{ padding: '24px', color: 'var(--ink-muted)', fontSize: '14px' }} role="alert">
            This volunteer is no longer on this incident. Close and choose another.
          </div>
        </div>
      </div>
    )
  }

  const { profile } = popup
  const title = profile.role ? `${profile.name} · ${profile.role}` : profile.name

  return (
    <div
      className="exp-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div ref={panel} className="exp-panel" role="dialog" aria-modal="true" aria-labelledby="exp-title">
        {/* Panel header */}
        <header className="exp-header">
          <h2 className="exp-header-name" id="exp-title">{title}</h2>
          <HeaderStats lang={lang} popup={popup} />
          <button type="button" className="exp-close" onClick={onClose} aria-label={t(lang, expandedCopy.close)}>
            {t(lang, expandedCopy.closeShort)}
          </button>
        </header>

        {/* Two-pane grid */}
        <div className="exp-grid">
          {/* Left pane */}
          <div className="exp-left" aria-label="Field view">
            <VideoArea lang={lang} />
            <WindArea lang={lang} detail={detail} />
            <LatestMessage lang={lang} popup={popup} />
            <SnapshotsArea lang={lang} popup={popup} incidentId={detail.incident.id} photoUrl={photoUrl} />
            <SentArea lang={lang} popup={popup} />
          </div>

          {/* Right pane — full Ask EMBER */}
          <AskEmberPane
            lang={lang}
            popup={popup}
            assist={assist}
            offline={offline}
            onSendInstruction={(instruction) => sendInstruction(volunteerId, instruction)}
          />
        </div>
      </div>
    </div>
  )
}

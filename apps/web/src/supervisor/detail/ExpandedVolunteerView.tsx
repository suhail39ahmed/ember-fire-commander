import { useEffect, useMemo, useRef, useState } from 'react'

import { formatTime, formatTimeZone } from '../../pwa/formatTime'
import { chipText } from '../../pwa/report/chips'
import { t, type Lang } from '../../pwa/i18n'
import { ApiError } from '../../pwa/api/types'
import type { AskAnswer, IncidentDetail, PhotoUrl, TaskDecision } from '../contracts'
import { screenStrings } from '../../pwa/screens/strings'
import { severityName, taskCopy } from './copy'
import { expandedCopy } from './expandedCopy'
import { batteryText, networkText, popupFor, visionLine, type Popup } from './popupModel'
import { instructionCopy, photoCopy } from './instructionCopy'
import { instructionFailure, sendBlock, type SendBlock } from './instructionModel'
import { initialsOf } from './model'
import { createHoldToTalk } from './holdToTalk'
import { worthShowing, ASK_MAX } from './assistModel'
import type { AssistActions } from './assistModel'
import { SnapshotImage } from './SnapshotImage'
import './expanded.css'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** One Q&A pair in the chat thread. */
export interface ChatEntry {
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

/** Wind chip over the video: stored conditions or a "not available yet" note. Whether the volunteer is upwind needs a position the API does not give. */
function WindChip({ lang, detail }: { lang: Lang; detail: IncidentDetail }) {
  const weather = detail.conditions?.weather ?? null
  const has = weather && (weather.windFrom || weather.windKmh !== null)
  return (
    <div className={has ? 'exp-wind-chip' : 'exp-wind-chip exp-wind-off'} aria-label={t(lang, expandedCopy.windChip)}>
      {has ? (
        <>
          <span className="exp-wind-label">{t(lang, expandedCopy.windChip)}</span>{' '}
          {[weather.windFrom, weather.windKmh !== null ? `${Math.round(weather.windKmh)} km/h` : null].filter(Boolean).join(' · ')}
        </>
      ) : (
        <>
          <span className="exp-wind-label">{t(lang, expandedCopy.windChip)}</span>{' '}
          {t(lang, expandedCopy.windNotYet)}
        </>
      )}
    </div>
  )
}

/**
 * A two-way channel from the console to one volunteer. Nothing provides one yet: the voice gateway relays the
 * volunteer's audio and frames to the model and never carries console audio or video (shared contract §7, §10).
 * When a service does, it passes this in and the controls below start working; until then they stay disabled.
 */
export interface LiveChannel {
  talking: boolean
  videoOn: boolean
  /** 0 to 1, the supervisor's own input level while talking. */
  level?: number
  startTalk(): void
  stopTalk(): void
  setVideo(on: boolean): void
}

/** Hold to talk, a start/stop video toggle, and the controls that need a live feed. All disabled, with the reason, without a channel. */
function LiveControls({ lang, name, channel }: { lang: Lang; name: string; channel?: LiveChannel }) {
  const channelRef = useRef(channel)
  channelRef.current = channel
  const hold = useMemo(() => createHoldToTalk(() => channelRef.current?.startTalk(), () => channelRef.current?.stopTalk()), [])
  useEffect(() => () => hold.up(), [hold])
  const reason = t(lang, expandedCopy.controlsOff)
  const connected = channel !== undefined
  const talking = connected && channel.talking
  const videoOn = connected && channel.videoOn
  const off = (label: string, why = reason) => ({ disabled: true, title: why, 'aria-label': label })
  return (
    <>
      <div className="exp-controls" aria-label="live controls">
        <button
          type="button"
          className={talking ? 'exp-ctrl-btn exp-ctrl-on' : 'exp-ctrl-btn'}
          {...(connected ? { title: t(lang, expandedCopy.mic), 'aria-label': `${t(lang, expandedCopy.mic)} · ${name}` } : off(t(lang, expandedCopy.mic)))}
          aria-pressed={talking}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); hold.down() }}
          onPointerUp={() => hold.up()}
          onPointerCancel={() => hold.up()}
          onLostPointerCapture={() => hold.up()}
          onBlur={() => hold.up()}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hold.down() } }}
          onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') hold.up() }}
        >
          {talking ? t(lang, expandedCopy.micOn) : t(lang, expandedCopy.mic)}
        </button>
        {talking && channel.level !== undefined && (
          <span className="exp-level" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={channel.level} aria-label="input level">
            <span style={{ width: `${Math.round(Math.max(0, Math.min(1, channel.level)) * 100)}%` }} />
          </span>
        )}
        <button
          type="button"
          className={videoOn ? 'exp-ctrl-btn exp-ctrl-on' : 'exp-ctrl-btn'}
          {...(connected ? { 'aria-label': t(lang, videoOn ? expandedCopy.videoOn : expandedCopy.video) } : off(t(lang, expandedCopy.video)))}
          aria-pressed={videoOn}
          onClick={() => channel?.setVideo(!videoOn)}
        >
          {t(lang, videoOn ? expandedCopy.videoOn : expandedCopy.video)}
        </button>
        {([expandedCopy.snapshot, expandedCopy.flip, expandedCopy.endLive] as const).map((label, i, all) => (
          <button key={label.en} type="button" className={i === all.length - 1 ? 'exp-ctrl-btn exp-ctrl-end' : 'exp-ctrl-btn'} {...off(t(lang, label), connected ? t(lang, expandedCopy.needsFeed) : reason)}>
            {t(lang, label)}
          </button>
        ))}
      </div>
      {!connected && <p className="exp-controls-note" role="note">{reason}</p>}
    </>
  )
}

/** Live video placeholder — out of scope until the live seat media path is wired (#102). */
function VideoArea({ lang, detail, name, channel }: { lang: Lang; detail: IncidentDetail; name: string; channel?: LiveChannel }) {
  return (
    <div className="exp-section exp-video-section" aria-label={t(lang, expandedCopy.leftTitle)}>
      <div className="exp-video-stage">
        <div className="exp-video-box" role="img" aria-label={t(lang, expandedCopy.videoPlaceholder)}>
          <span className="exp-video-off">{t(lang, expandedCopy.notYet).toUpperCase()}</span>
          <p className="exp-video-body">{t(lang, expandedCopy.videoPlaceholder)}</p>
        </div>
        <span className="exp-live-badge" aria-label="LIVE">LIVE</span>
        <WindChip lang={lang} detail={detail} />
        <div className="exp-caption-card">
          <p className="exp-caption-title">{t(lang, expandedCopy.captionTitle)}</p>
          <p className="exp-caption-body">{t(lang, expandedCopy.captionPlaceholder)}</p>
        </div>
      </div>
      <LiveControls lang={lang} name={name} channel={channel} />
    </div>
  )
}

/** Latest message: volunteer's own words plus the stored English translation, labelled as AI. */
function LatestMessage({ lang, popup }: { lang: Lang; popup: Popup }) {
  const latest = popup.reports[0] ?? null
  const translation = latest ? popup.translations[latest.id] : undefined
  return (
    <div className="exp-section exp-msg-section" aria-label={t(lang, expandedCopy.latestMsg)}>
      {latest ? (
        <div className="exp-msg-card">
          <p className="exp-msg-meta">
            {popup.profile.name} · {formatTimeZone(latest.capturedAt)} · {t(lang, severityName[latest.severity])}
            {latest.chip && ` · ${chipText(latest.chip, lang)}`}
            {latest.source === 'photo' && ` · ${t(lang, expandedCopy.snapshot)}`}
          </p>
          <p className="exp-msg-text">{latest.text ? `"${latest.text}"` : t(lang, expandedCopy.notYet)}</p>
          {worthShowing(translation) && (
            <p className="exp-msg-en">
              <span>
                {t(lang, expandedCopy.english)}
                {translation.sourceLanguage && ` · ${t(lang, expandedCopy.translatedFrom)} ${translation.sourceLanguage}`}
              </span>
              &ldquo;{translation.english}&rdquo;
            </p>
          )}
        </div>
      ) : (
        <p className="exp-muted">{t(lang, expandedCopy.noMsg)}</p>
      )}
    </div>
  )
}

/** One photo, larger, over the panel. Escape closes the photo first and not the whole view. */
function PhotoLightbox({ lang, url, onClose }: { lang: Lang; url: string; onClose(): void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onCloseRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  return (
    <div className="exp-lightbox" role="dialog" aria-modal="true" aria-label={t(lang, expandedCopy.photoLarge)} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <img src={url} alt={t(lang, photoCopy.alt)} />
      <button ref={closeRef} type="button" className="exp-lightbox-close" onClick={onClose}>{t(lang, expandedCopy.photoLargeClose)}</button>
    </div>
  )
}

/** Saved snapshots: a row of small thumbnails, four across, with time and name under each. A click opens one larger. */
function SnapshotsArea({ lang, popup, incidentId, photoUrl }: {
  lang: Lang
  popup: Popup
  incidentId: string
  photoUrl(incidentId: string, observationId: string): Promise<PhotoUrl>
}) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="exp-section" aria-label={t(lang, expandedCopy.snapshots)}>
      <p className="exp-eyebrow">{t(lang, expandedCopy.snapshots)}</p>
      {popup.photos.length === 0 ? (
        <p className="exp-muted">{t(lang, expandedCopy.noSnapshots)}</p>
      ) : (
        <ul className="exp-snaps">
          {popup.photos.map((o) => {
            const read = visionLine(lang, popup.photoReads[o.id])
            const tipId = `exp-snap-tip-${o.id}`
            return (
              <li key={o.id} className="exp-snap" tabIndex={read ? 0 : undefined} aria-describedby={read ? tipId : undefined}>
                <SnapshotImage lang={lang} observationId={o.id} className="exp-snap-thumb" onOpen={setOpen} load={(id) => photoUrl(incidentId, id)} />
                <span className="exp-snap-cap">{formatTime(o.capturedAt)} · {popup.profile.name}</span>
                {read && <span className="exp-snap-ai"><b>{t(lang, expandedCopy.photoCheck)}</b> · {read}</span>}
                {read && (
                  <span id={tipId} role="tooltip" className="exp-snap-tip">
                    <b>{t(lang, expandedCopy.photoCheck)}</b>
                    <span className="exp-snap-tip-meta">{formatTime(o.capturedAt)} · {popup.profile.name}</span>
                    {read}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {open && <PhotoLightbox lang={lang} url={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** One block per declined task: reason label, optional note, and when they declined. Absent when no task is declined. */
function DeclinedArea({ lang, popup }: { lang: Lang; popup: Popup }) {
  const declined = popup.tasks.filter((task) => task.declinedAt)
  if (declined.length === 0) return null
  return (
    <div className="exp-section exp-declined-section" aria-label={t(lang, expandedCopy.declinedTitle)}>
      <p className="exp-eyebrow">{t(lang, expandedCopy.declinedTitle)}</p>
      <ul className="exp-declined-list">
        {declined.map((task) => {
          const reasonLabel = task.declineReason
            ? (screenStrings.decline.reasons[task.declineReason]?.[lang] ?? t(lang, expandedCopy.declinedNoReason))
            : t(lang, expandedCopy.declinedNoReason)
          const summary = task.instruction ?? t(lang, taskCopy.type[task.type])
          const note = task.declineNote?.trim() || null
          return (
            <li key={task.id} className="exp-declined-item">
              <p className="exp-declined-meta">
                {popup.profile.name}
                {task.declinedAt && <> · <time dateTime={task.declinedAt}>{formatTime(task.declinedAt)}</time></>}
              </p>
              <p className="exp-declined-summary">{summary}</p>
              <p className="exp-declined-reason">{reasonLabel}</p>
              {note && <p className="exp-declined-note">&ldquo;{note}&rdquo;</p>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** "Sent to <name>": one line per instruction with a green dot and a tick once it is heard or done. */
function SentArea({ lang, popup }: { lang: Lang; popup: Popup }) {
  return (
    <div className="exp-section" aria-label={`${t(lang, expandedCopy.sentTitle)} ${popup.profile.name}`}>
      <p className="exp-eyebrow">{t(lang, expandedCopy.sentTitle)} {popup.profile.name}</p>
      {popup.tasks.length === 0 ? (
        <p className="exp-muted">{t(lang, expandedCopy.noSent)}</p>
      ) : (
        <ul className="exp-sent-list">
          {popup.tasks.map((task) => {
            const status = task.acceptedAt
              ? { text: expandedCopy.done, tick: true }
              : task.declinedAt
                ? { text: expandedCopy.declined, tick: false }
                : task.heardAt
                  ? { text: expandedCopy.heard, tick: true }
                  : { text: expandedCopy.sentNoAnswer, tick: false }
            return (
              <li key={task.id} className="exp-sent-item">
                <span className="exp-sent-dot" aria-hidden="true" />
                <span className="exp-sent-line">
                  {task.sentAt && `${formatTime(task.sentAt)} · `}
                  {task.instruction ?? t(lang, taskCopy.type[task.type])}
                  {' · '}
                  <span className={`exp-sent-status${status.tick ? ' exp-sent-done' : ''}`}>
                    {t(lang, status.text)}{status.tick && ' ✓'}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** The inline proposal card: draft from the latest Ask answer, explicit send choices. */
export function ProposalCard({
  lang,
  name,
  draft,
  offline,
  block = null,
  onSendOnly,
}: {
  lang: Lang
  name: string
  draft: string | null
  offline: boolean
  /** Why a send is refused before any request: an extinguished incident, or an active WITHDRAW on this volunteer. */
  block?: SendBlock | null
  onSendOnly(text: string): Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSendOnly() {
    if (!draft || busy || offline || block) return
    setBusy(true)
    setResult(null)
    try {
      await onSendOnly(draft)
      setResult({ ok: true, text: t(lang, expandedCopy.sent) })
    } catch (error) {
      setResult({ ok: false, text: instructionFailure(error, lang) })
    } finally {
      setBusy(false)
    }
  }

  if (!draft) {
    return <p className="exp-proposal-hint" role="note">{t(lang, expandedCopy.proposalEmpty)}</p>
  }

  return (
    <div className="exp-proposal" aria-label={t(lang, expandedCopy.proposalTitle)} role="region">
      <p className="exp-proposal-title">
        <span className="exp-ai-tag">{t(lang, expandedCopy.aiDraft)}</span>
        {t(lang, expandedCopy.proposalTitle)}
      </p>
      <p className="exp-proposal-to">{t(lang, expandedCopy.toName)} {name}</p>
      <p className="exp-proposal-draft">{draft}</p>
      <p className="exp-proposal-q">{t(lang, expandedCopy.sendThis)}</p>
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
          disabled={busy || offline || block !== null}
          onClick={() => void handleSendOnly()}
          aria-label={`${t(lang, expandedCopy.sendOnly)} ${name}`}
        >
          {busy ? t(lang, expandedCopy.sending) : `${t(lang, expandedCopy.sendOnly)} ${name}`}
        </button>
      </div>
      <p className="exp-proposal-note">{t(lang, expandedCopy.sendBothNote)}</p>
      {block && !offline && <p className="exp-proposal-result err" role="status">{t(lang, instructionCopy.blocked[block])}</p>}
      {result && (
        <p className={`exp-proposal-result ${result.ok ? 'ok' : 'err'}`} role={result.ok ? 'status' : 'alert'}>
          {result.text}
        </p>
      )}
    </div>
  )
}

/** One question and the model's answer. The question is a plain bubble; the answer carries an "AI" chip. */
function ChatPair({ lang, entry }: { lang: Lang; entry: ChatEntry }) {
  return (
    <>
      <div className="exp-msg-row you" aria-label={t(lang, expandedCopy.you)}>
        <div className="exp-bubble">{entry.question}</div>
      </div>
      <div className="exp-msg-row ember" aria-label={t(lang, expandedCopy.ember)}>
        <span className="exp-ai-chip">{t(lang, expandedCopy.ember)}</span>
        <div className="exp-ai-reply">
          <div className="exp-bubble">
            {entry.answer.answer}
            {entry.answer.enoughData === false && (
              <p className="exp-not-enough">{t(lang, expandedCopy.notEnough)}</p>
            )}
          </div>
          <span className="exp-bubble-meta">{formatTimeZone(entry.answer.at)}</span>
        </div>
      </div>
    </>
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
          : `↑ ${t(lang, expandedCopy.showEarlier)} ${entries.length} ${t(lang, expandedCopy.earlierCount)}`}
      </button>
      {open && (
        <ol className="exp-earlier-list" aria-label={`${entries.length} ${t(lang, expandedCopy.earlierCount)}`}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <ChatPair lang={lang} entry={entry} />
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

/** The chat thread: a hint line while empty, otherwise a column as tall as its messages that scrolls once they outgrow the pane. */
export function AskThread({ lang, entries, threadRef }: { lang: Lang; entries: ChatEntry[]; threadRef?: React.Ref<HTMLDivElement> }) {
  const earlier = entries.length > 1 ? entries.slice(0, entries.length - 1) : []
  const latest = entries.length > 0 ? entries[entries.length - 1] : null
  return (
    <div className="exp-thread-zone" aria-live="polite" aria-label={t(lang, expandedCopy.chatTitle)}>
      {latest === null ? (
        <p className="exp-thread-empty">{t(lang, expandedCopy.chatNote)}</p>
      ) : (
        <div className="exp-thread" ref={threadRef}>
          <EarlierMessages lang={lang} entries={earlier} />
          <ChatPair lang={lang} entry={latest} />
        </div>
      )}
    </div>
  )
}

/** The right pane: chat thread + proposal card + input. The entire pane is Ask EMBER. */
function AskEmberPane({
  lang,
  popup,
  assist,
  offline,
  block,
  onSendInstruction,
}: {
  lang: Lang
  popup: Popup
  assist: AssistActions | undefined
  offline: boolean
  block: SendBlock | null
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
      <div className="exp-ask-head">
        <h3 className="exp-ask-title">{t(lang, expandedCopy.chatTitle)} {t(lang, expandedCopy.chatAbout)} {name}</h3>
        <span className="exp-tag">{t(lang, expandedCopy.asksBeforeSend)}</span>
      </div>
      {/* Thread: only as tall as its messages, scrolls once they outgrow the pane */}
      <AskThread lang={lang} entries={entries} threadRef={threadRef} />

      {/* Proposal card */}
      <ProposalCard
        lang={lang}
        name={name}
        draft={proposalDraft}
        offline={offline}
        block={block}
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
            <span aria-hidden="true">{busy ? '…' : '↑'}</span>
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
  /** Talk and video to this volunteer. Nothing supplies one yet, so the controls stay disabled. */
  liveChannel?: LiveChannel
}

/**
 * Two-pane expanded view for one volunteer. Opens over the incident detail; the detail stays visible
 * behind the backdrop. Left: live video placeholder and field reports. Right: full Ask EMBER chat.
 * Nothing is sent without an explicit supervisor choice. WITHDRAW is never delayed or blocked here.
 */
export function ExpandedVolunteerView({ lang, detail, volunteerId, onClose, offline, sendInstruction, photoUrl, assist, liveChannel }: ExpandedVolunteerViewProps) {
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
          <span className="exp-avatar" aria-hidden="true">{initialsOf(profile.name)}</span>
          <div className="exp-header-id">
            <h2 className="exp-header-name" id="exp-title">{title}</h2>
            <HeaderStats lang={lang} popup={popup} />
          </div>
          <button type="button" className="exp-close" onClick={onClose} aria-label={t(lang, expandedCopy.close)} title={t(lang, expandedCopy.closeShort)}>
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        {/* Two-pane grid */}
        <div className="exp-grid">
          {/* Left pane */}
          <div className="exp-left" aria-label="Field view">
            <VideoArea lang={lang} detail={detail} name={profile.name} channel={liveChannel} />
            <LatestMessage lang={lang} popup={popup} />
            <DeclinedArea lang={lang} popup={popup} />
            <SnapshotsArea lang={lang} popup={popup} incidentId={detail.incident.id} photoUrl={photoUrl} />
            <SentArea lang={lang} popup={popup} />
          </div>

          {/* Right pane — full Ask EMBER */}
          <AskEmberPane
            lang={lang}
            popup={popup}
            assist={assist}
            offline={offline}
            block={sendBlock(detail, volunteerId, false)}
            onSendInstruction={(instruction) => sendInstruction(volunteerId, instruction)}
          />
        </div>
      </div>
    </div>
  )
}

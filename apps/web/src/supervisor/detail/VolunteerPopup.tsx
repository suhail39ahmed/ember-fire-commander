import { useState, type ReactNode } from 'react'

import { formatTimeZone } from '../../pwa/formatTime'
import { chipText } from '../../pwa/report/chips'
import { t, type Lang } from '../../pwa/i18n'
import type { IncidentDetail, PhotoUrl, TaskDecision } from '../contracts'
import { severityName, taskCopy } from './copy'
import { DeliveryLine } from './DeliveryLine'
import { factorName } from './disagreeCopy'
import { instructionCopy, photoCopy, profileCopy, suggestCopy, visionCopy } from './instructionCopy'
import { instructionProblem, sendBlock, submitInstruction, type InstructionResult } from './instructionModel'
import { SnapshotImage } from './SnapshotImage'
import { INSTRUCTION_MAX } from './withdrawModel'
import { Modal } from './Modal'
import { answerLine, batteryText, languageText, networkText, popupFor, visionLine, type Popup } from './popupModel'
import { popupCopy, popupNeeds } from './popupCopy'
import './popup.css'

/** A region whose data no ember-api route returns yet. It says so, and says what is missing. */
function Gap({ lang, need }: { lang: Lang; need?: { id: string; en: string } }) {
  return (
    <p className="pop-gap">
      <b>{t(lang, popupCopy.notYet)}</b>
      {need && <> · {t(lang, popupCopy.needs)} {t(lang, need)}</>}
    </p>
  )
}

function Region({ title, note, children, className }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={className ? `pop-region ${className}` : 'pop-region'} aria-label={title}>
      <h3 className="pop-eyebrow">{title}{note && <span className="pop-eyebrow-note"> · {note}</span>}</h3>
      {children}
    </section>
  )
}

function Video({ lang }: { lang: Lang }) {
  return (
    <Region title={t(lang, popupCopy.video)} className="pop-video">
      <div className="pop-screen" role="img" aria-label={t(lang, popupCopy.videoBody)}>
        <span className="pop-live-off">{t(lang, popupCopy.liveOff)}</span>
        <p>{t(lang, popupCopy.videoBody)}</p>
      </div>
      <Gap lang={lang} need={popupNeeds.video} />
      <div className="pop-controls">
        {[popupCopy.mic, popupCopy.videoBtn, popupCopy.snapshot, popupCopy.flip, popupCopy.endLive].map((label) => (
          <button key={label.en} type="button" className="pop-btn" disabled>{t(lang, label)}</button>
        ))}
      </div>
    </Region>
  )
}

function Transcript({ lang, popup }: { lang: Lang; popup: Popup }) {
  return (
    <Region title={t(lang, popupCopy.transcript)} note={t(lang, popupCopy.transcriptNote)}>
      {popup.reports.length === 0 ? (
        <p className="pop-muted">{t(lang, popupCopy.noReports)}</p>
      ) : (
        <ul className="pop-lines">
          {popup.reports.map((o) => (
            <li key={o.id}>
              <p className="pop-line-meta">
                {formatTimeZone(o.capturedAt)} · {t(lang, severityName[o.severity])}
                {o.chip && ` · ${chipText(o.chip, lang)}`}
                {o.source === 'photo' && ` · ${t(lang, popupCopy.photoReport)}`}
              </p>
              <p className="pop-line-text">{o.text ? `“${o.text}”` : t(lang, popupCopy.noText)}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="pop-gap">{t(lang, popupCopy.translation)}</p>
    </Region>
  )
}

function Snapshots({ lang, popup, incidentId, photoUrl }: { lang: Lang; popup: Popup; incidentId: string; photoUrl: (incidentId: string, observationId: string) => Promise<PhotoUrl> }) {
  return (
    <Region title={t(lang, popupCopy.snapshots)}>
      {popup.photos.length === 0 ? (
        <p className="pop-muted">{t(lang, popupCopy.noSnapshots)}</p>
      ) : (
        <ul className="pop-snaps">
          {popup.photos.map((o) => (
            <li key={o.id} className="pop-snap">
              <SnapshotImage lang={lang} observationId={o.id} load={(observationId) => photoUrl(incidentId, observationId)} />
              <span>{formatTimeZone(o.capturedAt)} · {popup.profile.name}</span>
              {visionLine(lang, popup.photoReads[o.id]) && (
                <p className="pop-line-text pop-vision">
                  <b>{t(lang, visionCopy.title)}</b> · {visionLine(lang, popup.photoReads[o.id])}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {popup.photos.some((o) => visionLine(lang, popup.photoReads[o.id])) && <p className="pop-gap">{t(lang, visionCopy.note)}</p>}
      <p className="pop-gap">{t(lang, photoCopy.note)}</p>
    </Region>
  )
}

function Sent({ lang, popup, now, onResend }: { lang: Lang; popup: Popup; now: number; onResend?: (taskId: string) => Promise<{ auditId: string }> }) {
  return (
    <Region title={`${t(lang, popupCopy.sent)} ${popup.profile.name}`}>
      {popup.tasks.length === 0 ? (
        <p className="pop-muted">{t(lang, popupCopy.noInstructions)}</p>
      ) : (
        <ul className="pop-lines">
          {popup.tasks.map((task) => (
            <li key={task.id}>
              <p className="pop-line-meta">{t(lang, taskCopy.type[task.type])}{task.sentAt && ` · ${formatTimeZone(task.sentAt)}`}</p>
              <p className="pop-line-text">{task.instruction ?? '—'}</p>
              <DeliveryLine lang={lang} task={task} now={now} onResend={onResend} />
              {answerLine(lang, task, formatTimeZone) && <p className="pop-line-meta pop-answer">{answerLine(lang, task, formatTimeZone)}</p>}
            </li>
          ))}
        </ul>
      )}
    </Region>
  )
}

function Profile({ lang, popup }: { lang: Lang; popup: Popup }) {
  const p = popup.profile
  const none = '—'
  const rows: Array<[string, string]> = [
    [t(lang, popupCopy.role), p.role ?? none],
    [t(lang, profileCopy.crew), p.crew ?? none],
    [t(lang, popupCopy.incident), p.incidentName ?? '—'],
    [t(lang, popupCopy.position), p.position ? `${p.position}${p.accuracyM !== null ? ` · ±${p.accuracyM} m` : ''}` : none],
    [t(lang, popupCopy.distance), p.distance ?? none],
    [t(lang, popupCopy.firstReport), p.firstReportAt ? formatTimeZone(p.firstReportAt) : none],
    [t(lang, popupCopy.lastReport), p.lastReportAt ? formatTimeZone(p.lastReportAt) : none],
    [t(lang, popupCopy.reports), String(p.reportCount)],
    [t(lang, popupCopy.network), networkText(p) ?? none],
    [t(lang, popupCopy.battery), batteryText(p.device) ?? none],
    [t(lang, popupCopy.language), languageText(lang, p.device) ?? none],
    [t(lang, popupCopy.lastHeard), p.lastHeardAt ? formatTimeZone(p.lastHeardAt) : none],
    [t(lang, profileCopy.device), p.pushReady === null ? none : t(lang, p.pushReady ? profileCopy.deviceYes : profileCopy.deviceNo)],
  ]
  return (
    <Region title={t(lang, popupCopy.profile)}>
      <dl className="pop-profile">
        {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <p className="pop-gap">
        {p.device && p.device.at ? `${t(lang, profileCopy.deviceNote)} ${formatTimeZone(p.device.at)}` : t(lang, profileCopy.deviceNone)}
        {p.role === null && ` ${t(lang, profileCopy.roleNone)}`}
      </p>
    </Region>
  )
}

function Suggestions({ lang, popup }: { lang: Lang; popup: Popup }) {
  return (
    <Region title={t(lang, popupCopy.suggestions)}>
      {popup.suggestions.length === 0 ? (
        <p className="pop-muted">{t(lang, suggestCopy.none)}</p>
      ) : (
        <ul className="pop-lines">
          {popup.suggestions.map((task) => (
            <li key={task.id} className="pop-sugg">
              <p className="pop-line-meta">{t(lang, taskCopy.type[task.type])}</p>
              <p className="pop-line-text">{task.instruction ?? '—'}</p>
              <p className="pop-muted">{task.type === 'verify' && popup.hasConflict ? t(lang, suggestCopy.reasonConflict) : t(lang, suggestCopy.reasonNone)}</p>
            </li>
          ))}
        </ul>
      )}
      {popup.suggestions.length > 0 && <p className="pop-gap">{t(lang, suggestCopy.decideInList)}</p>}
      {popup.factors.length > 0 && (
        <>
          <p className="pop-eyebrow">{t(lang, suggestCopy.factors)}</p>
          <ul className="pop-lines">
            {popup.factors.map((f, i) => (
              <li key={`${f.factor}-${i}`}>
                <p className="pop-line-meta">{factorName[f.factor] ? t(lang, factorName[f.factor]) : f.factor} · {f.points > 0 ? `+${f.points}` : f.points < 0 ? `−${Math.abs(f.points)}` : '0'}</p>
                <p className="pop-line-text">{f.detail}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="pop-gap">{t(lang, suggestCopy.limit)}</p>
    </Region>
  )
}

/** One instruction to this volunteer. It is sent now and logged; it can never hold or replace a WITHDRAW. */
function SendForm({ lang, popup, detail, offline, send }: { lang: Lang; popup: Popup; detail: IncidentDetail; offline: boolean; send: (instruction: string) => Promise<TaskDecision> }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<InstructionResult | null>(null)
  const block = sendBlock(detail, popup.profile.id, offline)
  const problem = text === '' ? null : instructionProblem(text)

  async function submit() {
    if (busy || block) return
    setBusy(true)
    const outcome = await submitInstruction(send, text, popup.profile.name, lang)
    setBusy(false)
    setResult(outcome)
    if (outcome.ok) setText('')
  }

  return (
    <Region title={t(lang, popupCopy.send)}>
      <div className="pop-send-form">
        <textarea
          className="pop-textarea"
          aria-label={t(lang, instructionCopy.label)}
          placeholder={t(lang, instructionCopy.placeholder)}
          value={text}
          disabled={block !== null || busy}
          onChange={(e) => { setText(e.target.value); setResult(null) }}
        />
        <p className="pop-gap">{INSTRUCTION_MAX - text.trim().length} {t(lang, instructionCopy.left)}</p>
        {block && <p className="pop-error pop-result" role="status">{t(lang, instructionCopy.blocked[block])}</p>}
        {!block && problem === 'too_long' && <p className="pop-error pop-result" role="alert">{t(lang, instructionCopy.problem.too_long)}</p>}
        <label className="pop-check"><input type="checkbox" disabled /> {t(lang, popupCopy.sendAll)}</label>
        <p className="pop-gap">{t(lang, instructionCopy.onlyOne)}</p>
        <button type="button" className="pop-btn pop-send" disabled={block !== null || busy || text.trim() === '' || problem !== null} onClick={() => void submit()}>
          {busy ? t(lang, instructionCopy.sending) : t(lang, popupCopy.sendBtn)}
        </button>
        {result && <p className={result.ok ? 'pop-result' : 'pop-result pop-error'} role={result.ok ? 'status' : 'alert'}>{result.text}</p>}
        <p className="pop-rule">{t(lang, popupCopy.withdrawRule)}</p>
      </div>
    </Region>
  )
}

function Side({ lang, popup, detail, offline, send }: { lang: Lang; popup: Popup; detail: IncidentDetail; offline: boolean; send: (instruction: string) => Promise<TaskDecision> }) {
  return (
    <>
      <Profile lang={lang} popup={popup} />
      <Suggestions lang={lang} popup={popup} />
      <Region title={`${t(lang, popupCopy.ask)} ${popup.profile.name}`} note={t(lang, popupCopy.askBefore)}>
        <Gap lang={lang} need={popupNeeds.ask} />
        <p className="pop-muted">{t(lang, popupCopy.askGap)}</p>
        <input className="pop-input" disabled placeholder={t(lang, popupCopy.askPlaceholder)} aria-label={t(lang, popupCopy.askPlaceholder)} />
      </Region>
      <SendForm lang={lang} popup={popup} detail={detail} offline={offline} send={send} />
    </>
  )
}

export interface VolunteerPopupProps {
  lang: Lang
  detail: IncidentDetail
  volunteerId: string
  /** Close returns to the incident detail. It writes nothing. */
  onClose(): void
  /** Offline: every write is off. */
  offline: boolean
  /** The server-aligned clock in ms, for the delivery lines. */
  now: number
  onResend?: (taskId: string) => Promise<{ auditId: string }>
  /** POST /incidents/{id}/volunteers/{volunteerId}/instruct, then a fresh read. Throws the route's refusal. */
  sendInstruction(volunteerId: string, instruction: string): Promise<TaskDecision>
  /** GET /incidents/{id}/photos/{observationId}: a short-lived signed read link. */
  photoUrl(incidentId: string, observationId: string): Promise<PhotoUrl>
}

/**
 * One volunteer, over the incident detail. The incident behind it stays as it is. Every region of the
 * frame is here; the ones ember-api cannot fill yet say so in place instead of showing made-up content.
 */
export function VolunteerPopup({ lang, detail, volunteerId, onClose, offline, now, onResend, sendInstruction, photoUrl }: VolunteerPopupProps) {
  const popup = popupFor(detail, volunteerId, lang)
  if (!popup) {
    return (
      <Modal title={t(lang, popupCopy.close)} onClose={onClose} wide>
        <p className="inc-modal-error" role="alert">{t(lang, popupCopy.gone)}</p>
        <div className="inc-modal-actions">
          <button type="button" className="inc-btn inc-btn-ink" onClick={onClose}>{t(lang, popupCopy.close)}</button>
        </div>
      </Modal>
    )
  }
  const { profile } = popup
  return (
    <Modal title={profile.name} onClose={onClose} wide>
      <p className="pop-sub">
        <span className="inc-avatar" aria-hidden="true">{profile.initials}</span>
        {profile.incidentName}
        {popup.withdrawn && <span className="inc-pill inc-pill-red">{t(lang, popupCopy.withdrawn)}</span>}
      </p>
      <div className="pop-grid">
        <div className="pop-col">
          <Video lang={lang} />
          <Transcript lang={lang} popup={popup} />
          <Snapshots lang={lang} popup={popup} incidentId={detail.incident.id} photoUrl={photoUrl} />
          <Sent lang={lang} popup={popup} now={now} onResend={onResend} />
        </div>
        <div className="pop-col">
          <Side lang={lang} popup={popup} detail={detail} offline={offline} send={(instruction) => sendInstruction(volunteerId, instruction)} />
        </div>
      </div>
      <div className="inc-modal-actions">
        <button type="button" className="inc-btn inc-btn-ink" onClick={onClose}>{t(lang, popupCopy.close)}</button>
      </div>
    </Modal>
  )
}

import type { ReactNode } from 'react'

import { formatTime } from '../../pwa/formatTime'
import { chipText } from '../../pwa/report/chips'
import { t, type Lang } from '../../pwa/i18n'
import { shortIncidentId } from '../../pwa/incidentName'
import type { IncidentDetail } from '../contracts'
import { detailCopy, severityName, taskCopy, taskStatusName } from './copy'
import { Modal } from './Modal'
import { popupFor, type Popup } from './popupModel'
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
                {formatTime(o.capturedAt)} · {t(lang, severityName[o.severity])}
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

function Snapshots({ lang, popup }: { lang: Lang; popup: Popup }) {
  return (
    <Region title={t(lang, popupCopy.snapshots)}>
      {popup.photos.length === 0 ? (
        <p className="pop-muted">{t(lang, popupCopy.noSnapshots)}</p>
      ) : (
        <ul className="pop-snaps">
          {popup.photos.map((o) => (
            <li key={o.id} className="pop-snap">
              <span className="pop-snap-img" aria-hidden="true" />
              <span>{formatTime(o.capturedAt)} · {popup.profile.name}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="pop-gap">{t(lang, popupCopy.snapshotsGap)}</p>
    </Region>
  )
}

function Sent({ lang, popup }: { lang: Lang; popup: Popup }) {
  return (
    <Region title={`${t(lang, popupCopy.sent)} ${popup.profile.name}`}>
      {popup.tasks.length === 0 ? (
        <p className="pop-muted">{t(lang, popupCopy.noInstructions)}</p>
      ) : (
        <ul className="pop-lines">
          {popup.tasks.map((task) => (
            <li key={task.id}>
              <p className="pop-line-meta">{t(lang, taskCopy.type[task.type])} · {t(lang, taskStatusName[task.status])}</p>
              <p className="pop-line-text">{task.instruction ?? '—'}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="pop-gap">{t(lang, popupCopy.heardGap)}</p>
    </Region>
  )
}

function Profile({ lang, popup }: { lang: Lang; popup: Popup }) {
  const p = popup.profile
  const none = '—'
  const rows: Array<[string, string]> = [
    [t(lang, popupCopy.role), none],
    [t(lang, popupCopy.incident), `${p.incidentName ?? `${t(lang, detailCopy.idLabel)} ${shortIncidentId(p.incidentId)}`} · ${p.incidentId}`],
    [t(lang, popupCopy.position), p.position ? `${p.position}${p.accuracyM !== null ? ` · ±${p.accuracyM} m` : ''}` : none],
    [t(lang, popupCopy.distance), p.distance ?? none],
    [t(lang, popupCopy.firstReport), p.firstReportAt ? formatTime(p.firstReportAt) : none],
    [t(lang, popupCopy.lastReport), p.lastReportAt ? formatTime(p.lastReportAt) : none],
    [t(lang, popupCopy.reports), String(p.reportCount)],
    [t(lang, popupCopy.network), none],
    [t(lang, popupCopy.battery), none],
    [t(lang, popupCopy.language), none],
    [t(lang, popupCopy.lastHeard), none],
  ]
  return (
    <Region title={t(lang, popupCopy.profile)}>
      <dl className="pop-profile">
        {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <p className="pop-gap">{t(lang, popupCopy.profileGap)}</p>
    </Region>
  )
}

function Side({ lang, popup }: { lang: Lang; popup: Popup }) {
  return (
    <>
      <Profile lang={lang} popup={popup} />
      <Region title={t(lang, popupCopy.suggestions)}>
        <Gap lang={lang} need={popupNeeds.suggestions} />
        <p className="pop-muted">{t(lang, popupCopy.suggestionsGap)}</p>
      </Region>
      <Region title={`${t(lang, popupCopy.ask)} ${popup.profile.name}`} note={t(lang, popupCopy.askBefore)}>
        <Gap lang={lang} need={popupNeeds.ask} />
        <p className="pop-muted">{t(lang, popupCopy.askGap)}</p>
        <input className="pop-input" disabled placeholder={t(lang, popupCopy.askPlaceholder)} aria-label={t(lang, popupCopy.askPlaceholder)} />
      </Region>
      <Region title={`${t(lang, popupCopy.send)}`}>
        <Gap lang={lang} need={popupNeeds.send} />
        <p className="pop-muted">{t(lang, popupCopy.sendGap)}</p>
        <label className="pop-check"><input type="checkbox" disabled /> {t(lang, popupCopy.sendAll)}</label>
        <button type="button" className="pop-btn pop-send" disabled>{t(lang, popupCopy.sendBtn)}</button>
        <p className="pop-rule">{t(lang, popupCopy.withdrawRule)}</p>
      </Region>
    </>
  )
}

export interface VolunteerPopupProps {
  lang: Lang
  detail: IncidentDetail
  volunteerId: string
  /** Close returns to the incident detail. It writes nothing. */
  onClose(): void
}

/**
 * One volunteer, over the incident detail. The incident behind it stays as it is. Every region of the
 * frame is here; the ones ember-api cannot fill yet say so in place instead of showing made-up content.
 */
export function VolunteerPopup({ lang, detail, volunteerId, onClose }: VolunteerPopupProps) {
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
        {profile.incidentName ?? shortIncidentId(profile.incidentId)} · {profile.incidentId}
        {popup.withdrawn && <span className="inc-pill inc-pill-red">{t(lang, popupCopy.withdrawn)}</span>}
      </p>
      <div className="pop-grid">
        <div className="pop-col">
          <Video lang={lang} />
          <Transcript lang={lang} popup={popup} />
          <Snapshots lang={lang} popup={popup} />
          <Sent lang={lang} popup={popup} />
        </div>
        <div className="pop-col">
          <Side lang={lang} popup={popup} />
        </div>
      </div>
      <div className="inc-modal-actions">
        <button type="button" className="inc-btn inc-btn-ink" onClick={onClose}>{t(lang, popupCopy.close)}</button>
      </div>
    </Modal>
  )
}

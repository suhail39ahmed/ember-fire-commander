import { useState } from 'react'
import { Link } from 'react-router-dom'

import { formatTime } from '../../pwa/formatTime'
import { chipText } from '../../pwa/report/chips'
import { t, type Lang } from '../../pwa/i18n'
import { incidentLabel, shortIncidentId } from '../../pwa/incidentName'
import type { Incident, IncidentDecision, IncidentDetail, LowerableSeverity, WithdrawRequest } from '../contracts'
import { conflictPair, taskControls } from '../view'
import { IncidentMap } from '../map/IncidentMap'
import { OutcomeLine, TaskRow, type IncidentActions } from '../IncidentView'
import type { DetailFailure } from '../incidentsContext'
import { POLL_MS } from '../incidentsContext'
import { CONSOLE_PATHS } from '../paths'
import { ActionBar } from './ActionBar'
import { detailCopy, severityName, statusName } from './copy'
import { distanceM, formatPosition, highestReport, minutesBetween, nameOf, timelineOf, volunteersOf, type LinkState } from './model'
import { ExtinguishDialog } from './ExtinguishDialog'
import { doneText } from './extinguishModel'
import { extinguishCopy } from './extinguishCopy'
import { LowerSeverityDialog } from './LowerSeverityDialog'
import { disagreeCopy, factorName } from './disagreeCopy'
import { ProposalRow } from './ProposalRow'
import { ReportCard } from './ReportCard'
import { SendWithdrawDialog } from './SendWithdrawDialog'
import { loweredText } from './severityModel'
import { VolunteerCard } from './VolunteerCard'
import { WithdrawPanel } from './WithdrawPanel'
import { elapsedSince, unconfirmed, withdrawState } from './withdrawState'
import { countText, stateCopy } from './withdrawStateCopy'
import { sentText } from './withdrawModel'
import './detail.css'

export interface IncidentDetailViewProps {
  lang: Lang
  incidentId: string
  /** The incident read for `incidentId`, or null while it loads or when it could not be read. */
  detail: IncidentDetail | null
  /** The queue, for the map. Null before the first read. */
  queue: Incident[] | null
  failure: DetailFailure | null
  link: LinkState
  /** Last good read, in ms, for the "last update" line. */
  lastOkAt: number | null
  now: number
  actions: IncidentActions
  onRetry(): void
  onSelect(id: string): void
  /** POST /incidents/{id}/withdraw, then a fresh read. Resolves with the route's answer. */
  sendWithdraw(request: WithdrawRequest): Promise<IncidentDecision>
  /** The signed-in supervisor's name, for the confirmation line. */
  actorName: string
  /** Server-aligned clock in ms, for the "at HH:mm" in the extinguish confirmation. */
  serverNow(): number
  /** POST /incidents/{id}/severity, then a fresh read. Resolves with the route's answer. */
  lowerSeverity(severity: LowerableSeverity): Promise<IncidentDecision>
  /** POST /incidents/{id}/extinguish, then a fresh read. Resolves with the route's answer. */
  extinguish(): Promise<IncidentDecision>
  /** POST /incidents/{id}/withdraw/safe, then a fresh read. Resolves with the route's answer. */
  markSafe(volunteerId: string): Promise<IncidentDecision>
  mapsKey?: string
}

function ageText(lang: Lang, lastOkAt: number | null, now: number): string {
  if (lastOkAt === null) return ''
  const time = formatTime(lastOkAt)
  const mins = minutesBetween(lastOkAt, now)
  const ago = mins < 1 ? t(lang, detailCopy.justNow) : `${mins} ${t(lang, detailCopy.minAgo)}`
  return `${time} (${ago})`
}

function ConnectionBanner({ lang, lastOkAt, now, onRetry }: { lang: Lang; lastOkAt: number | null; now: number; onRetry(): void }) {
  const age = ageText(lang, lastOkAt, now)
  return (
    <>
      <div className="inc-banner inc-banner-lost" role="alert">
        <div>
          <p className="inc-banner-title">
            {t(lang, detailCopy.lostTitle)}
            {age && <span className="inc-muted"> {t(lang, detailCopy.lostUpdate)} {age}</span>}
          </p>
          <p className="inc-muted">
            {age ? `${t(lang, detailCopy.lostBody)} ${POLL_MS / 1000} ${t(lang, detailCopy.seconds)}.` : t(lang, detailCopy.lostNever)}
          </p>
        </div>
        <button type="button" className="inc-btn" onClick={onRetry}>{t(lang, detailCopy.retryNow)}</button>
      </div>
      <section className="inc-card inc-works" aria-label={t(lang, detailCopy.worksTitle)}>
        <p className="inc-eyebrow">{t(lang, detailCopy.worksTitle)}</p>
        <ul>
          {detailCopy.works.map((line) => <li key={line.en}>{t(lang, line)}</li>)}
        </ul>
      </section>
    </>
  )
}

function Crumb({ lang, label }: { lang: Lang; label: string }) {
  return (
    <nav className="inc-crumb" aria-label="Breadcrumb">
      <Link to={CONSOLE_PATHS.incidents}>← {t(lang, detailCopy.crumbIncidents)}</Link>
      <span aria-hidden="true"> / </span>
      <span aria-current="page">{label}</span>
    </nav>
  )
}

function Skeleton({ lang, label }: { lang: Lang; label: string }) {
  return (
    <div className="inc-skeleton" role="status" aria-label={`${t(lang, detailCopy.loading)} ${label}`}>
      <p className="inc-muted">{t(lang, detailCopy.loading)} {label}…</p>
      <span className="inc-skel inc-skel-title" />
      <span className="inc-skel inc-skel-line" />
      <div className="inc-stats">
        {[0, 1, 2, 3].map((i) => <span key={i} className="inc-skel inc-skel-card" />)}
      </div>
      <h2 className="inc-h2">{t(lang, detailCopy.fieldTitle)}</h2>
      <div className="inc-field">
        {[0, 1].map((i) => <span key={i} className="inc-skel inc-skel-vol" />)}
      </div>
    </div>
  )
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <section className="inc-stat" aria-label={label}>
      <p className="inc-eyebrow">{label}</p>
      <p className={tone ? `inc-stat-value ${tone}` : 'inc-stat-value'}>{value}</p>
      {note && <p className="inc-muted">{note}</p>}
    </section>
  )
}

function Body({ lang, detail, link, actions, view }: { lang: Lang; detail: IncidentDetail; link: LinkState; actions: IncidentActions; view: Pick<IncidentDetailViewProps, 'actorName' | 'serverNow' | 'sendWithdraw' | 'lowerSeverity' | 'extinguish' | 'markSafe'> }) {
  const { incident, conflict } = detail
  const { actorName, sendWithdraw, lowerSeverity, markSafe, serverNow } = view
  const [dialog, setDialog] = useState<'withdraw' | 'severity' | 'extinguish' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const offline = link === 'lost'
  const volunteers = volunteersOf(detail)
  const wd = withdrawState(detail)
  // The frame pauses instructions while someone is still unconfirmed.
  const paused = wd !== null && !wd.allSafe
  const waiting = new Map(wd ? unconfirmed(wd).map((p) => [p.id, elapsedSince(wd.sentAt, serverNow())] as const) : [])
  const pair = conflictPair(detail)
  const top = highestReport(detail)
  const gap = pair.length === 2 ? distanceM(pair[0], pair[1]) : null
  const proposals = detail.tasks.filter((task) => taskControls(task, detail).canDecide)
  const others = detail.tasks.filter((task) => !taskControls(task, detail).canDecide)
  const reporters = new Set(detail.observations.map((o) => o.volunteerId)).size
  return (
    <>
      <header className="inc-head">
        <div className="inc-pills">
          <span className={`inc-pill status-${incident.status}`}>{t(lang, statusName[incident.status])}</span>
          <span className="inc-pill"><i className={`inc-dot sev-${incident.severity}`} aria-hidden="true" />{t(lang, severityName[incident.severity])}</span>
          {wd && (
            <span className="inc-pill inc-pill-red">
              {t(lang, detailCopy.withdrawPill)}{!wd.allSafe && ` · ${countText(lang, wd)} ${t(lang, stateCopy.pillOf)}`}
            </span>
          )}
          {incident.status === 'held' && <span className="inc-pill inc-pill-amber">{t(lang, detailCopy.holdPill)}</span>}
          <span className={offline ? 'inc-pill inc-pill-red' : 'inc-pill inc-pill-quiet'}>
            {offline ? t(lang, detailCopy.lastKnown) : `${volunteers.length} ${t(lang, detailCopy.onSite)}`}
          </span>
          <span className="inc-pill inc-pill-quiet">{t(lang, detailCopy.idLabel)} {incident.id}</span>
        </div>
        <h1 className="inc-title">{incidentLabel(incident)}</h1>
        <ActionBar
          lang={lang}
          incident={incident}
          offline={offline}
          busy={actions.busyId === incident.id}
          onVerify={actions.onVerify}
          onSendWithdraw={() => { setNotice(null); setDialog('withdraw') }}
          onLowerSeverity={() => { setNotice(null); setDialog('severity') }}
          onExtinguish={() => { setNotice(null); setDialog('extinguish') }}
        />
        {notice && <p className="sup-ok" role="status">{notice}</p>}
        <OutcomeLine outcome={actions.outcomes[incident.id]} lang={lang} />
      </header>

      {wd && <WithdrawPanel lang={lang} state={wd} now={serverNow} offline={offline} markSafe={markSafe} nameOf={(id) => nameOf(detail, id, lang)} />}

      {conflict && (
        <section aria-label={t(lang, detailCopy.conflictTitle)}>
          <div className={conflict.status === 'open' ? 'dis-banner' : 'dis-banner resolved'} role={conflict.status === 'open' ? 'alert' : undefined}>
            <h2>{conflict.status === 'open' ? t(lang, disagreeCopy.bannerTitle) : t(lang, disagreeCopy.bannerResolved)}</h2>
            <p>
              {pair.length === 2 && (
                <>
                  {nameOf(detail, pair[0].volunteerId, lang)} {t(lang, disagreeCopy.says)} {t(lang, severityName[pair[0].severity]).toLowerCase()},{' '}
                  {nameOf(detail, pair[1].volunteerId, lang)} {t(lang, disagreeCopy.says)} {t(lang, severityName[pair[1].severity]).toLowerCase()}
                  {gap !== null && `, ${gap} m ${t(lang, disagreeCopy.apart)}`}.{' '}
                </>
              )}
              {t(lang, disagreeCopy.bannerRule)}
            </p>
          </div>
          <div className="inc-pair">
            {pair.map((o) => <ReportCard key={o.id} lang={lang} obs={o} />)}
          </div>
          <p className="inc-muted">{t(lang, detailCopy.conflictBody)} {t(lang, detailCopy.conflictHigher)}: {t(lang, severityName[conflict.higherSeverity])}.</p>
        </section>
      )}

      {proposals.length > 0 && (
        <section aria-labelledby="inc-prop-title">
          <h2 className="inc-h2" id="inc-prop-title">{t(lang, disagreeCopy.proposals)}</h2>
          <ul className="prop-list">
            {proposals.map((task) => <ProposalRow key={task.id} lang={lang} task={task} detail={detail} actions={actions} offline={offline || paused} />)}
          </ul>
        </section>
      )}

      <div className="inc-stats">
        <Stat
          label={t(lang, detailCopy.statSeverity)}
          value={t(lang, severityName[incident.severity])}
          tone={`sev-${incident.severity}`}
          note={top ? `${t(lang, detailCopy.statSeverityRule)} · ${nameOf(detail, top.volunteerId, lang)} · ${formatTime(top.capturedAt)}` : t(lang, detailCopy.statSeverityRule)}
        />
        <Stat label={t(lang, detailCopy.statEvidence)} value={String(incident.evidenceScore)} note={t(lang, detailCopy.statEvidenceNote)} />
        <Stat
          label={t(lang, detailCopy.statReports)}
          value={String(detail.observations.length)}
          note={`${reporters} ${lang === 'id' ? 'relawan' : reporters === 1 ? 'volunteer' : 'volunteers'}`}
        />
        <Stat label={t(lang, detailCopy.statPosition)} value={formatPosition(incident)} note={incident.area ?? t(lang, detailCopy.statPositionNote)} />
      </div>

      <section aria-labelledby="inc-field-title">
        <h2 className="inc-h2" id="inc-field-title">
          {t(lang, detailCopy.fieldTitle)}
          <span className="inc-h2-note">{volunteers.length} · {t(lang, detailCopy.fieldNote)}</span>
        </h2>
        {volunteers.length === 0 ? (
          <p className="inc-muted">{t(lang, detailCopy.fieldEmpty)}</p>
        ) : (
          <div className="inc-field">
            {volunteers.map((row) => <VolunteerCard key={row.id} lang={lang} row={row} safe={wd ? wd.people.find((x) => x.id === row.id)?.safe ?? null : null} waiting={waiting.get(row.id) ?? null} />)}
          </div>
        )}
      </section>

      <section className="inc-card" aria-labelledby="inc-instr-title">
        <h2 className="inc-h2" id="inc-instr-title">
          {t(lang, detailCopy.instructionsTitle)}
          <span className="inc-h2-note">{t(lang, detailCopy.instructionsNote)}</span>
        </h2>
        {detail.tasks.length === 0 ? (
          <p className="inc-muted">{t(lang, detailCopy.tasksEmpty)}</p>
        ) : others.length > 0 && (
          <ul className="sup sup-tasks">
            {others.map((task) => <TaskRow key={task.id} task={task} detail={detail} actions={actions} offline={offline || paused} lang={lang} />)}
          </ul>
        )}
        {offline && <p className="inc-muted">{t(lang, detailCopy.offlineSend)}</p>}
        {paused && <p className="wd-paused">{t(lang, stateCopy.paused)}</p>}
        <p className="inc-callout">{t(lang, detailCopy.withdrawRule)}</p>
      </section>
      {dialog === 'withdraw' && (
        <SendWithdrawDialog
          lang={lang}
          incident={incident}
          rows={volunteers}
          offline={offline}
          send={sendWithdraw}
          onSent={(count, auditId) => { setDialog(null); setNotice(sentText(lang, count, auditId)) }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'severity' && (
        <LowerSeverityDialog
          lang={lang}
          incident={incident}
          offline={offline}
          send={lowerSeverity}
          onLowered={(severity, auditId) => {
            setDialog(null)
            setNotice(loweredText(lang, t(lang, severityName[severity]), actorName, auditId, Boolean(incident.withdraw?.active)))
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'extinguish' && (
        <ExtinguishDialog
          lang={lang}
          incident={incident}
          actorName={view.actorName}
          offline={offline}
          send={view.extinguish}
          onDone={(auditId) => { setDialog(null); setNotice(doneText(lang, view.actorName, view.serverNow(), auditId)) }}
          onAlreadyOut={() => { setDialog(null); setNotice(t(lang, extinguishCopy.alreadyOut)) }}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}

function Rail({ lang, detail, queue, onSelect, mapsKey }: Pick<IncidentDetailViewProps, 'lang' | 'detail' | 'queue' | 'onSelect' | 'mapsKey'>) {
  // An extinguished incident has left the live queue; the map still shows the one that is open.
  const open = detail?.incident
  const incidents = queue && queue.length > 0 ? (open && !queue.some((i) => i.id === open.id) ? [...queue, open] : queue) : open ? [open] : []
  const events = detail ? timelineOf(detail) : []
  return (
    <aside className="inc-rail">
      <IncidentMap incidents={incidents} selectedId={detail?.incident.id ?? null} onSelect={onSelect} mapsKey={mapsKey} />
      {detail && (
        <section className="inc-card" aria-labelledby="inc-why-title">
          <h2 className="inc-h2" id="inc-why-title">{t(lang, disagreeCopy.factorsTitle)} {detail.incident.evidenceScore}</h2>
          {!detail.evidenceFactors || detail.evidenceFactors.length === 0 ? (
            <p className="inc-muted">{t(lang, disagreeCopy.factorsEmpty)}</p>
          ) : (
            <ul className="why">
              {detail.evidenceFactors.map((f, i) => (
                <li key={`${f.factor}-${i}`}>
                  <span className={f.points < 0 ? 'why-points neg' : 'why-points'}>{f.points > 0 ? `+${f.points}` : f.points < 0 ? `−${Math.abs(f.points)}` : '0'}</span>
                  <span><span className="why-name">{factorName[f.factor] ? t(lang, factorName[f.factor]) : f.factor}</span><br />{f.detail}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="inc-muted">{t(lang, disagreeCopy.notProbability)} {t(lang, disagreeCopy.auditNote)}</p>
        </section>
      )}
      <section className="inc-card" aria-labelledby="inc-timeline-title">
        <h2 className="inc-h2" id="inc-timeline-title">{t(lang, detailCopy.timeline)}</h2>
        <p className="inc-muted">{t(lang, detailCopy.timelineNote)}</p>
        {events.length === 0 ? (
          <p className="inc-muted">{t(lang, detailCopy.timelineEmpty)}</p>
        ) : (
          <ol className="inc-timeline">
            {events.map((o) => (
              <li key={o.id}>
                <time dateTime={o.capturedAt}>{formatTime(o.capturedAt)}</time>
                <span>
                  {detail ? nameOf(detail, o.volunteerId, lang) : o.volunteerId} · {o.chip ? chipText(o.chip, lang) : t(lang, severityName[o.severity])}
                  {o.text ? ` · “${o.text}”` : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  )
}

/** The incident detail screen for `/console/incidents/:incidentId`: every state in one component, props only. */
export function IncidentDetailView(props: IncidentDetailViewProps) {
  const { lang, incidentId, detail, failure, link, lastOkAt, now, actions, onRetry } = props
  const label = detail ? incidentLabel(detail.incident) : props.queue?.find((i) => i.id === incidentId)
    ? incidentLabel(props.queue.find((i) => i.id === incidentId)!)
    : shortIncidentId(incidentId)
  let body
  if (detail) {
    body = <Body lang={lang} detail={detail} link={link} actions={actions} view={props} />
  } else if (failure === 'not_found') {
    body = (
      <section className="inc-card inc-state" role="alert">
        <h1 className="inc-h2">{t(lang, detailCopy.notFoundTitle)}</h1>
        <p className="inc-muted">{t(lang, detailCopy.notFoundBody)}</p>
        <Link className="inc-btn inc-btn-link" to={CONSOLE_PATHS.incidents}>{t(lang, detailCopy.back)}</Link>
      </section>
    )
  } else if (failure === 'failed') {
    body = (
      <section className="inc-card inc-state" role="alert">
        <h1 className="inc-h2">{t(lang, detailCopy.failedTitle)}</h1>
        <p className="inc-muted">{t(lang, detailCopy.failedBody)}</p>
        <button type="button" className="inc-btn" onClick={onRetry}>{t(lang, detailCopy.retry)}</button>
      </section>
    )
  } else if (failure === 'network') {
    body = null
  } else {
    body = <Skeleton lang={lang} label={label} />
  }
  return (
    <div className="inc sup">
      {link === 'lost' && <ConnectionBanner lang={lang} lastOkAt={lastOkAt} now={now} onRetry={onRetry} />}
      {link === 'restored' && <p className="inc-banner inc-banner-ok" role="status">{t(lang, detailCopy.restored)}</p>}
      <div className="inc-cols">
        <div className="inc-main">
          <Crumb lang={lang} label={label} />
          {body}
        </div>
        <Rail lang={lang} detail={detail} queue={props.queue} onSelect={props.onSelect} mapsKey={props.mapsKey} />
      </div>
    </div>
  )
}

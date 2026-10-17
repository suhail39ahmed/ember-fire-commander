import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { strings, t, type Lang } from '../i18n'
import type { Digest } from '../contracts/types'
import { formatTime } from '../formatTime'
import { incidentLabelById } from '../incidentName'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { completedIncidents, completedGroups, assignedTasks, liveIncidents, parseTab, type IncidentsTab } from './incidentsView'
import { SeverityBadge } from './IncidentBadges'
import { IncidentRow } from './IncidentRow'
import { screenStrings } from './strings'
import './incidents.css'

export function IncidentsList({ digest, lang, tab, onTab }: { digest: Digest | null; lang: Lang; tab: IncidentsTab; onTab: (tab: IncidentsTab) => void }) {
  const live = liveIncidents(digest)
  const done = completedIncidents(digest)
  const { recent, older } = completedGroups(digest)
  const tasks = assignedTasks(digest)
  const empty = digest !== null && (tab === 'live' ? live.length === 0 && tasks.length === 0 : done.length === 0)
  const s = screenStrings.incidents
  return <section className="incidents-screen" data-testid="incidents-screen">
    <h2 className="screen-title">{t(lang, s.title)}</h2>
    <p className="incidents-subtitle">{t(lang, s.subtitle)}</p>
    <div className="segments" role="group" aria-label={t(lang, s.segments)}>
      {(['live', 'completed'] as const).map((value) => <button key={value} type="button" className="segment" aria-pressed={tab === value} onClick={() => onTab(value)} data-testid={`segment-${value}`}>
        {value === 'live' && <i className="incidents-live-dot" aria-hidden="true" />}{t(lang, s[value])}<span className="segment-count">{value === 'live' ? live.length : done.length}</span>
      </button>)}
    </div>
    {!digest && <div className="skeleton" aria-busy="true" data-testid="incidents-skeleton"><p className="vol-sr-only" role="status">{t(lang, screenStrings.common.loading)}</p><div className="sk sk-card" /><div className="sk sk-row" /></div>}
    {empty && <section className="card empty" data-testid="incidents-empty"><h3>{t(lang, tab === 'live' ? s.emptyTitle : s.emptyCompleted)}</h3>
      {tab === 'live' && <><p className="muted">{t(lang, s.emptyBody)}</p><Link className="btn primary report-cta" to="/pwa/report">{t(lang, screenStrings.common.reportFire)}</Link></>}
    </section>}
    {tab === 'live' && tasks.length > 0 && <section aria-labelledby="assigned-title">
      <div className="incidents-section-head"><h3 id="assigned-title">{t(lang, s.assigned)}</h3><span>{t(lang, s.taskCount(tasks.length))}</span></div>
      <ul className="rows">{tasks.map((task) => {
        const incident = digest?.incidents.find((row) => row.id === task.incidentId)
        const time = task.createdAt || task.sentAt
        return <li key={task.id}><Link className="incident-task-card" to={`/pwa/task/${encodeURIComponent(task.id)}`} data-testid={`task-${task.id}`}>
          <div className="incident-card-top"><span className="incident-task-label">{t(lang, strings.taskType[task.type])}{task.reasonCode === 'reports_disagree' && ` · ${t(lang, s.disagree)}`}</span>{time && Number.isFinite(Date.parse(time)) && <time className="incident-meta" dateTime={time}>{formatTime(time)}</time>}</div>
          <strong className="incident-task-instruction">{task.instruction || t(lang, strings.taskType[task.type])}</strong>
          <div className="incident-card-bottom"><span className="incident-task-code">{incident?.code || incidentLabelById(task.incidentId, digest?.incidents)}</span>{incident && <SeverityBadge severity={incident.severity} lang={lang} />}<span className="incident-open">{t(lang, s.openAction)}</span></div>
        </Link></li>
      })}</ul>
    </section>}
    {tab === 'live' && live.length > 0 && <section aria-labelledby="mine-title">
      <div className="incidents-section-head"><h3 id="mine-title">{t(lang, s.liveNow)}</h3><span>{t(lang, s.incidentCount(live.length))}</span></div>
      <ul className="rows">{live.map((incident) => <IncidentRow key={incident.id} incident={incident} lang={lang} card />)}</ul>
    </section>}
    {tab === 'completed' && recent.length > 0 && <section aria-labelledby="recent-title">
      <div className="incidents-section-head"><h3 id="recent-title">{t(lang, s.last30Days)}</h3><span>{t(lang, s.incidentCount(recent.length))}</span></div>
      <ul className="rows">{recent.map((incident) => <IncidentRow key={incident.id} incident={incident} lang={lang} card />)}</ul>
    </section>}
    {tab === 'completed' && older.length > 0 && <section aria-labelledby="closed-title">
      <div className="incidents-section-head"><h3 id="closed-title">{t(lang, s.older)}</h3><span>{t(lang, s.incidentCount(older.length))}</span></div>
      <ul className="rows">{older.map((incident) => <IncidentRow key={incident.id} incident={incident} lang={lang} card />)}</ul>
      {older.some((incident) => !incident.closedAt || !Number.isFinite(Date.parse(incident.closedAt))) && <p className="muted small" data-testid="closed-missing">{t(lang, s.closedMissing)}</p>}
    </section>}
  </section>
}

export function IncidentsScreen() {
  const { lang } = useLanguage()
  const { digest } = useVolunteer()
  const [params, setParams] = useSearchParams()
  const tab = parseTab(params.get('tab'))
  useEffect(() => { window.scrollTo(0, 0) }, [])
  return <IncidentsList digest={digest} lang={lang} tab={tab} onTab={(next) => setParams(next === 'live' ? {} : { tab: next }, { replace: true })} />
}

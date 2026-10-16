import { Link } from 'react-router-dom'

import { currentTask } from '../digest'
import { formatTime } from '../formatTime'
import { strings, t, type Lang } from '../i18n'
import { incidentLabelById } from '../incidentName'
import type { Digest } from '../contracts/types'
import type { DigestStatus } from '../useDigest'
import { assignedTasks, liveIncidents } from './incidentsView'
import { IncidentRow } from './IncidentRow'
import { screenStrings } from './strings'

const MAX_HOME_INCIDENTS = 3

export interface HomeProps {
  lang: Lang
  digest: Digest | null
  status: DigestStatus
  lastSyncAt: string | null
  online: boolean
  queuedCount: number
}

/** Placeholder card shapes while `/digest` has not returned. Same heights as the real cards, so nothing jumps. */
function HomeSkeleton({ lang }: { lang: Lang }) {
  return (
    <div className="skeleton" aria-busy="true" data-testid="home-skeleton">
      <p className="vol-sr-only" role="status">{t(lang, screenStrings.common.loading)}</p>
      <div className="sk sk-card" />
      <div className="sk sk-stats" />
      <div className="sk sk-row" />
      <div className="sk sk-row" />
    </div>
  )
}

/**
 * Home (#127). Who has a task waiting, a few counts from the digest, the volunteer's incidents and one Report
 * button. Wind is not shown: no client payload carries an observed wind.
 */
export function HomeScreen({ lang, digest, status, lastSyncAt, online, queuedCount }: HomeProps) {
  const reportButton = (
    <Link className="btn primary report-cta" to="/pwa/report">
      {t(lang, screenStrings.common.reportFire)}
    </Link>
  )

  if (!digest && status === 'loading') {
    return (
      <>
        <HomeSkeleton lang={lang} />
        {reportButton}
      </>
    )
  }

  const task = currentTask(digest)
  const live = liveIncidents(digest)
  const tasks = assignedTasks(digest)
  const offline = !online
  return (
    <>
      {offline && (
        <section className="card offline-card" role="status" data-testid="home-offline">
          <h2>{t(lang, screenStrings.home.offlineTitle)}</h2>
          <p>{t(lang, screenStrings.home.offlineBody)}</p>
          <p className="muted small">
            {lastSyncAt ? `${t(lang, screenStrings.home.lastSync)} ${formatTime(lastSyncAt)}` : t(lang, screenStrings.common.notAvailable)}
          </p>
        </section>
      )}

      {digest && (
        <>
          {task && task.type !== 'withdraw' ? (
            <section className="card task" aria-labelledby="home-task-title">
              <p className="section-label">{t(lang, screenStrings.home.taskWaiting)}</p>
              <h2 id="home-task-title">
                {t(lang, strings.taskType[task.type])} · {incidentLabelById(task.incidentId, digest.incidents)}
              </h2>
              {task.instruction && <p className="instruction">{task.instruction}</p>}
              <Link className="btn primary" to={`/pwa/task/${encodeURIComponent(task.id)}`}>
                {t(lang, screenStrings.home.openTask)}
              </Link>
            </section>
          ) : (
            <section className="card">
              <h2>{t(lang, strings.noTask)}</h2>
              <p className="muted">{t(lang, screenStrings.home.allClear)}</p>
            </section>
          )}

          <ul className="stats" aria-label={t(lang, screenStrings.home.yourIncidents)}>
            <li className="stat">
              <strong>{tasks.length}</strong>
              <span>{t(lang, screenStrings.home.statTasks)}</span>
            </li>
            <li className="stat">
              <strong>{live.length}</strong>
              <span>{t(lang, screenStrings.home.statIncidents)}</span>
            </li>
            <li className="stat">
              <strong>{queuedCount}</strong>
              <span>{t(lang, screenStrings.home.statQueued)}</span>
            </li>
          </ul>

          {live.length > 0 ? (
            <section aria-labelledby="home-incidents-title">
              <div className="list-head">
                <h3 id="home-incidents-title" className="section-label">{t(lang, screenStrings.home.yourIncidents)}</h3>
                <Link className="see-all" to="/pwa/incidents">{t(lang, screenStrings.common.seeAll)}</Link>
              </div>
              <ul className="rows">
                {live.slice(0, MAX_HOME_INCIDENTS).map((incident) => (
                  <IncidentRow key={incident.id} incident={incident} lang={lang} />
                ))}
              </ul>
            </section>
          ) : (
            <p className="muted" data-testid="home-no-incidents">{t(lang, screenStrings.home.noIncidents)}</p>
          )}
        </>
      )}
      {reportButton}
    </>
  )
}

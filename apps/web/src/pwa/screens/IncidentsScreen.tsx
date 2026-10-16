import { Link, useSearchParams } from 'react-router-dom'

import { strings, t } from '../i18n'
import { incidentLabelById } from '../incidentName'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { completedIncidents, assignedTasks, liveIncidents, parseTab, type IncidentsTab } from './incidentsView'
import { IncidentRow } from './IncidentRow'
import { screenStrings } from './strings'
import type { Digest } from '../contracts/types'
import type { Lang } from '../i18n'

/**
 * Incidents (#142, #143): one page with two segments. Live lists the tasks sent to this volunteer and the incidents they
 * are linked to; Completed lists the extinguished ones. Both read the digest the layout already polls.
 */
export function IncidentsList({ digest, lang, tab, onTab }: { digest: Digest | null; lang: Lang; tab: IncidentsTab; onTab: (tab: IncidentsTab) => void }) {
  const live = liveIncidents(digest)
  const done = completedIncidents(digest)
  const tasks = assignedTasks(digest)
  const empty = tab === 'live' ? live.length === 0 && tasks.length === 0 : done.length === 0

  return (
    <>
      <h2 className="screen-title">{t(lang, screenStrings.incidents.title)}</h2>
      <div className="segments" role="group" aria-label={t(lang, screenStrings.incidents.segments)}>
        {(['live', 'completed'] as const).map((value) => (
          <button key={value} type="button" className="segment" aria-pressed={tab === value} onClick={() => onTab(value)} data-testid={`segment-${value}`}>
            {t(lang, screenStrings.incidents[value])}
            <span className="segment-count">{value === 'live' ? live.length : done.length}</span>
          </button>
        ))}
      </div>

      {empty && (
        <section className="card empty" data-testid="incidents-empty">
          <h3>{t(lang, tab === 'live' ? screenStrings.incidents.emptyTitle : screenStrings.incidents.emptyCompleted)}</h3>
          {tab === 'live' && <p className="muted">{t(lang, screenStrings.incidents.emptyBody)}</p>}
          {tab === 'live' && (
            <Link className="btn primary report-cta" to="/pwa/report">
              {t(lang, screenStrings.common.reportFire)}
            </Link>
          )}
        </section>
      )}

      {tab === 'live' && tasks.length > 0 && (
        <section aria-labelledby="assigned-title">
          <h3 id="assigned-title" className="section-label">{t(lang, screenStrings.incidents.assigned)}</h3>
          <ul className="rows">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link className="row" to={`/pwa/task/${encodeURIComponent(task.id)}`} data-testid={`task-${task.id}`}>
                  <span className="row-dot sev-small_flame" aria-hidden="true" />
                  <span className="row-text">
                    <strong>{t(lang, strings.taskType[task.type])} · {incidentLabelById(task.incidentId, digest?.incidents)}</strong>
                    {task.instruction && <span className="muted small clamp">{task.instruction}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'live' && live.length > 0 && (
        <section aria-labelledby="mine-title">
          <h3 id="mine-title" className="section-label">{t(lang, screenStrings.incidents.mine)}</h3>
          <ul className="rows">
            {live.map((incident) => (
              <IncidentRow key={incident.id} incident={incident} lang={lang} />
            ))}
          </ul>
        </section>
      )}

      {tab === 'completed' && done.length > 0 && (
        <section aria-labelledby="closed-title">
          <h3 id="closed-title" className="section-label">{t(lang, screenStrings.incidents.closed)}</h3>
          <ul className="rows">
            {done.map((incident) => (
              <IncidentRow key={incident.id} incident={incident} lang={lang} />
            ))}
          </ul>
          <p className="muted small" data-testid="closed-missing">{t(lang, screenStrings.incidents.closedMissing)}</p>
        </section>
      )}
    </>
  )
}

export function IncidentsScreen() {
  const { lang } = useLanguage()
  const { digest } = useVolunteer()
  const [params, setParams] = useSearchParams()
  const tab = parseTab(params.get('tab'))
  return <IncidentsList digest={digest} lang={lang} tab={tab} onTab={(next) => setParams(next === 'live' ? {} : { tab: next }, { replace: true })} />
}

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type { EmberApi } from '../api/types'
import { currentTask } from '../digest'
import { formatTime } from '../formatTime'
import { strings, t, type Lang } from '../i18n'
import { incidentLabelById } from '../incidentName'
import type { Digest } from '../contracts/types'
import type { DigestStatus } from '../useDigest'
import { assignedTasks, liveIncidents } from './incidentsView'
import { IncidentRow } from './IncidentRow'
import { NearbyPrompt } from './NearbyPrompt'
import { isNearbyDismissed } from './nearbyDismiss'
import { screenStrings } from './strings'
import { NoSignalCard } from './NoSignalCard'
import { useDevicePosition } from './useDevicePosition'
import { useBattery, useNow, useOfflineSince } from '../useDeviceStatus'
import type { OutboxItem } from '../outbox/types'

const MAX_HOME_INCIDENTS = 3

export interface HomeProps {
  lang: Lang
  digest: Digest | null
  status: DigestStatus
  lastSyncAt: string | null
  online: boolean
  queuedCount: number
  /** What is waiting in the outbox, for the no-signal card. Without it the card says no report is saved. */
  queued?: OutboxItem[]
  /** ember-api client. Required so Join now on the nearby prompt can call it. */
  api: EmberApi
  volunteerId?: string | null
  /** Re-read the digest after Join now. */
  onRefresh: () => void
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
export function HomeScreen({
  lang,
  digest,
  status,
  lastSyncAt,
  online,
  queuedCount,
  queued = [],
  api,
  volunteerId = null,
  onRefresh,
}: HomeProps) {
  const offlineSince = useOfflineSince(online)
  const battery = useBattery()
  const nowMs = useNow()
  const devicePosition = useDevicePosition(Boolean(online && digest))
  const [dismissTick, setDismissTick] = useState(0)
  const nearby = useMemo(() => {
    void dismissTick
    const list = digest?.nearby ?? []
    return list.find((row) => !isNearbyDismissed(volunteerId, row.id)) ?? null
  }, [digest?.nearby, volunteerId, dismissTick])
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
  const you = devicePosition.kind === 'ok' ? { lat: devicePosition.lat, lng: devicePosition.lng } : null
  return (
    <>
      {offline && <NoSignalCard lang={lang} sinceMs={offlineSince} batteryPct={battery} task={task && task.type !== 'withdraw' ? task : null} queued={queued} nowMs={nowMs} />}
      {offline && lastSyncAt && (
        <p className="muted small" data-testid="home-last-sync">
          {t(lang, screenStrings.home.lastSync)} {formatTime(lastSyncAt)}
        </p>
      )}
      {offline && !lastSyncAt && <p className="muted small">{t(lang, screenStrings.common.notAvailable)}</p>}

      {digest && nearby && !offline && (
        <NearbyPrompt
          lang={lang}
          api={api}
          volunteerId={volunteerId}
          nearby={nearby}
          you={you}
          onDismissed={() => setDismissTick((n) => n + 1)}
          onJoined={onRefresh}
        />
      )}

      {digest && (
        <>
          {offline ? null : task && task.type !== 'withdraw' ? (
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

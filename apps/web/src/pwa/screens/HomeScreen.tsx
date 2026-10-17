import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import type { EmberApi } from '../api/types'
import type { Digest, NearbyIncident } from '../contracts/types'
import { currentTask } from '../digest'
import { formatTime } from '../formatTime'
import { strings, t, type Lang } from '../i18n'
import { incidentLabelById } from '../incidentName'
import type { OutboxItem } from '../outbox/types'
import type { DigestStatus } from '../useDigest'
import { useBattery, useNow, useOfflineSince } from '../useDeviceStatus'
import type { DevicePosition } from './arrival'
import { liveIncidents } from './incidentsView'
import { IncidentRow } from './IncidentRow'
import { JoinSheet } from './JoinSheet'
import { AiSuggestCard, NearbyCard } from './NearbyCards'
import { nearbyIncidents, nearbyState, pickPrompt, readDismissed, saveDismissed } from './nearby'
import { NoSignalCard } from './NoSignalCard'
import { screenStrings } from './strings'
import { useJoin } from './useJoin'
import './home.css'

const MAX_HOME_INCIDENTS = 3
const MAX_NEARBY = 3

export interface HomeProps {
  lang: Lang
  digest: Digest | null
  status: DigestStatus
  lastSyncAt: string | null
  online: boolean
  queuedCount: number
  /** What is waiting in the outbox, for the no-signal card. Without it the card says no report is saved. */
  queued?: OutboxItem[]
  /** Asking to join a nearby fire. Without them the nearby cards still show and the sheet cannot send. */
  api?: EmberApi
  refresh?: () => void
  /** The phone's position, for the sheet map and for the "allow location" hint. */
  position?: DevicePosition
}

/** Placeholder card shapes while `/digest` has not returned. Same heights as the real cards, so nothing jumps. */
function HomeSkeleton({ lang }: { lang: Lang }) {
  return (
    <div className="skeleton" aria-busy="true" data-testid="home-skeleton">
      <p className="home-loading" role="status">{t(lang, screenStrings.nearby.loadingIncidents)}</p>
      <div className="sk sk-card" />
      <div className="sk sk-near" />
      <div className="sk sk-near" />
    </div>
  )
}

function ReportTile({ lang }: { lang: Lang }) {
  return (
    <Link className="report-tile" to="/pwa/report" data-testid="report-tile">
      <span className="report-scan" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8" />
        </svg>
      </span>
      <span className="report-copy">
        <strong>{t(lang, screenStrings.common.reportFire)}</strong>
        <span>{t(lang, screenStrings.nearby.reportSub)}</span>
      </span>
    </Link>
  )
}

/** When a join request this phone made turns `approved` while Home is open, go to the "you joined" screen. */
function useJoinApproved(digest: Digest | null) {
  const navigate = useNavigate()
  const before = useRef<Map<string, string> | null>(null)
  useEffect(() => {
    if (!digest) return
    const now = new Map((digest.myJoinRequests ?? []).map((r) => [r.incidentId, r.status]))
    const earlier = before.current
    before.current = now
    if (!earlier) return
    for (const [incidentId, status] of now) {
      if (status === 'approved' && earlier.get(incidentId) === 'pending') {
        navigate(`/pwa/incidents/${encodeURIComponent(incidentId)}/joined`)
        return
      }
    }
  }, [digest, navigate])
}

/**
 * Home (Figma H1 to H4, and the fire-near-you sheet). One Report tile, the AI card for the nearest fire the volunteer
 * can ask to join, their own incidents, and the fires near them. Wind is not shown: no service stores an observed wind.
 */
export function HomeScreen({ lang, digest, status, lastSyncAt, online, queuedCount, queued = [], api, refresh = () => undefined, position }: HomeProps) {
  const offlineSince = useOfflineSince(online)
  const battery = useBattery()
  const nowMs = useNow()
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => readDismissed())
  const [openId, setOpenId] = useState<string | null>(null)
  const join = useJoin(api ?? NO_API, refresh)
  useJoinApproved(digest)

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id)
      saveDismissed(next)
      return next
    })
  }, [])

  if (!digest && status === 'loading') {
    return (
      <>
        <ReportTile lang={lang} />
        <HomeSkeleton lang={lang} />
      </>
    )
  }

  const task = currentTask(digest)
  const live = liveIncidents(digest)
  const offline = !online
  const near = offline ? [] : nearbyIncidents(digest)
  const prompt = offline ? null : pickPrompt(digest, dismissed)
  const open: NearbyIncident | null = openId ? (near.find((i) => i.id === openId) ?? null) : null
  const stateOf = (id: string) => (join.sent.has(id) ? 'waiting' : nearbyState(digest, id))
  const needsLocation = !offline && digest !== null && position !== undefined && position.kind !== 'ok' && position.kind !== 'waiting'

  return (
    <>
      {offline && <NoSignalCard lang={lang} sinceMs={offlineSince} batteryPct={battery} task={task && task.type !== 'withdraw' ? task : null} queued={queued} nowMs={nowMs} />}
      {offline && lastSyncAt && (
        <p className="muted small" data-testid="home-last-sync">
          {t(lang, screenStrings.home.lastSync)} {formatTime(lastSyncAt)}
        </p>
      )}
      {offline && !lastSyncAt && <p className="muted small">{t(lang, screenStrings.common.notAvailable)}</p>}

      {digest && !offline && task && task.type !== 'withdraw' && (
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
      )}

      <ReportTile lang={lang} />

      {prompt && <AiSuggestCard incident={prompt} lang={lang} onJoin={() => setOpenId(prompt.id)} onDismiss={() => dismiss(prompt.id)} />}

      {digest && live.length > 0 && (
        <section aria-labelledby="home-incidents-title">
          <div className="list-head">
            <h3 id="home-incidents-title" className="home-head">{t(lang, screenStrings.home.yourIncidents)}</h3>
            <Link className="see-all" to="/pwa/incidents">{t(lang, screenStrings.common.seeAll)}</Link>
          </div>
          <ul className="rows">
            {live.slice(0, MAX_HOME_INCIDENTS).map((incident) => (
              <IncidentRow key={incident.id} incident={incident} lang={lang} />
            ))}
          </ul>
        </section>
      )}

      {near.length > 0 && (
        <section aria-labelledby="home-near-title" data-testid="near-section">
          <div className="list-head">
            <h3 id="home-near-title" className="home-head">{t(lang, screenStrings.nearby.sectionTitle)}</h3>
            <Link className="see-all" to="/pwa/incidents">{t(lang, screenStrings.common.seeAll)}</Link>
          </div>
          <ul className="rows near-list">
            {near.slice(0, MAX_NEARBY).map((incident) => (
              <NearbyCard key={incident.id} incident={incident} lang={lang} state={stateOf(incident.id)} onOpen={() => setOpenId(incident.id)} />
            ))}
          </ul>
        </section>
      )}

      {needsLocation && <p className="muted small" data-testid="home-need-location">{t(lang, screenStrings.nearby.needLocation)}</p>}
      {queuedCount > 0 && (
        <p className="muted small" data-testid="home-queued">
          <strong>{queuedCount}</strong> {t(lang, screenStrings.nearby.waitingToSend)}
        </p>
      )}

      {open && (
        <JoinSheet
          incident={open}
          lang={lang}
          position={position ?? { kind: 'waiting' }}
          state={stateOf(open.id)}
          sending={join.sending === open.id}
          failure={join.failure}
          onJoin={() => {
            if (api) void join.ask(open.id)
          }}
          onClose={() => {
            join.clearFailure()
            setOpenId(null)
          }}
        />
      )}
    </>
  )
}

/** Stands in when Home is rendered without an API (static tests). Asking is never reachable then. */
const NO_API = { requestJoin: () => Promise.reject(new Error('no api')) } as unknown as EmberApi

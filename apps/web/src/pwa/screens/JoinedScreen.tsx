import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { ApiError } from '../api/types'
import type { IncidentDetail, IncidentMembership, IncidentSummary, Task } from '../contracts/types'
import { formatTime } from '../formatTime'
import { incidentLabel } from '../incidentName'
import { t, type Lang } from '../i18n'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import type { ActionState } from './actionState'
import { arrivalOf, type DevicePosition } from './arrival'
import { compassLabel, distanceM, formatDistance } from './geo'
import { findIncident, joinTask } from './incidentsView'
import { screenStrings } from './strings'
import { useDevicePosition } from './useDevicePosition'

function firstTask(tasks: Task[]): Task | null {
  const approved = tasks.filter((x) => x.status === 'approved' && x.type !== 'withdraw')
  return approved[0] ?? null
}

function Step({ icon, title, detail }: { icon: 'go' | 'meet' | 'task'; title: string; detail: string | null }) {
  return (
    <li className={`joined-step step-${icon}`}>
      <span className="joined-icon" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {detail && <p className="muted">{detail}</p>}
      </div>
    </li>
  )
}

export interface JoinedViewProps {
  lang: Lang
  detail: IncidentDetail
  /** Live distance from the phone, when GPS is available. */
  liveDistanceLabel: string | null
  enRouteAt: string | null
  busy: boolean
  error: string | null
  onMyWay: () => void
}

/** Presentational joined screen (#135). Missing route/meet/role fields are omitted. */
export function DirectJoinedView({ lang, detail, liveDistanceLabel, enRouteAt, busy, error, onMyWay }: JoinedViewProps) {
  const s = screenStrings.joined
  const membership = detail.membership ?? null
  const label = incidentLabel(detail.incident, lang)
  const task = firstTask(detail.tasks)
  const instruction = task?.instruction ?? null

  return (
    <section className="joined" data-testid="joined-screen">
      <JoinedBanner lang={lang} membership={membership} label={label} />
      <ul className="card joined-steps">
        {(membership?.destination || liveDistanceLabel) && (
          <Step
            icon="go"
            title={membership?.destination ?? `${t(lang, s.go)} ${liveDistanceLabel}`}
            detail={membership?.approach ?? null}
          />
        )}
        {membership?.meetPoint && (
          <Step
            icon="meet"
            title={
              membership.meetPerson
                ? `${t(lang, s.meet)} ${membership.meetPerson} · ${membership.meetPoint}`
                : `${t(lang, s.meet)} ${membership.meetPoint}`
            }
            detail={membership.meetNote}
          />
        )}
        {instruction && <Step icon="task" title={`${t(lang, s.firstTask)} ${instruction}`} detail={null} />}
      </ul>
      {!membership?.destination && !membership?.meetPoint && !instruction && !liveDistanceLabel && (
        <p className="muted" data-testid="joined-empty">
          {t(lang, s.waitingDetails)}
        </p>
      )}
      <button type="button" className="btn primary" disabled={busy || Boolean(enRouteAt)} onClick={onMyWay} data-testid="joined-en-route">
        {enRouteAt ? t(lang, s.onWay) : busy ? t(lang, s.sending) : t(lang, s.imOnMyWay)}
      </button>
      {enRouteAt && (
        <p className="muted small" data-testid="joined-en-route-at">
          {t(lang, s.onWaySince)} {formatTime(enRouteAt)}
        </p>
      )}
      <p className="muted small">{t(lang, s.footer)}</p>
      {error && (
        <p className="nearby-error" role="alert">
          {error}
        </p>
      )}
      <Link className="btn link" to="/pwa">
        {t(lang, screenStrings.common.back)}
      </Link>
    </section>
  )
}

function JoinedBanner({ lang, membership, label }: { lang: Lang; membership: IncidentMembership | null; label: string }) {
  const s = screenStrings.joined
  const when = membership?.joinedAt ? formatTime(membership.joinedAt) : null
  const who = membership?.addedByName
  const role = membership?.teamRole
  const line = [label, role].filter(Boolean).join(' · ')
  return (
    <div className="joined-banner" data-testid="joined-banner">
      <p className="section-label">
        {t(lang, s.youJoined)}
        {when ? ` · ${when}` : ''}
        {who ? ` · ${who}` : ''}
      </p>
      <p>
        {t(lang, s.youAreOn)} {line}
      </p>
    </div>
  )
}

/**
 * Joined incident (#135). Shown after Join now. Loads membership and the first task from ember-api.
 */
export function DirectJoinedScreen() {
  const { id = '' } = useParams()
  const { lang } = useLanguage()
  const { api, refresh } = useVolunteer()
  const [detail, setDetail] = useState<IncidentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [enRouteAt, setEnRouteAt] = useState<string | null>(null)
  const position = useDevicePosition(true)
  const s = screenStrings.joined

  useEffect(() => {
    let cancelled = false
    setError(null)
    void api
      .getIncident(id)
      .then((next) => {
        if (cancelled) return
        setDetail(next)
        setEnRouteAt(next.membership?.enRouteAt ?? null)
      })
      .catch(() => {
        if (!cancelled) setError(t(lang, s.loadFailed))
      })
    return () => {
      cancelled = true
    }
  }, [api, id, lang, s.loadFailed])

  async function onMyWay() {
    if (busy || enRouteAt) return
    setBusy(true)
    setError(null)
    try {
      const membership = await api.markEnRoute(id)
      setEnRouteAt(membership.enRouteAt)
      refresh()
    } catch {
      setError(t(lang, s.enRouteFailed))
    } finally {
      setBusy(false)
    }
  }

  if (error && !detail) {
    return (
      <section className="card">
        <p role="alert">{error}</p>
        <Link className="btn" to="/pwa">
          {t(lang, screenStrings.common.back)}
        </Link>
      </section>
    )
  }

  if (!detail) {
    return <p className="muted">{t(lang, screenStrings.common.loading)}</p>
  }

  const you = position.kind === 'ok' ? position : null
  const liveDistance =
    you && typeof detail.incident.lat === 'number'
      ? formatDistance(distanceM(you, { lat: detail.incident.lat, lng: detail.incident.lng }))
      : null
  const liveDistanceLabel = liveDistance
    ? `${liveDistance.value} ${liveDistance.unit.toUpperCase()}`
    : null

  return (
    <DirectJoinedView
      lang={lang}
      detail={detail}
      liveDistanceLabel={liveDistanceLabel}
      enRouteAt={enRouteAt}
      busy={busy}
      error={error}
      onMyWay={() => void onMyWay()}
    />
  )
}
const copy = screenStrings.nearby

function Icon({ kind }: { kind: 'nav' | 'check' }) {
  return (
    <svg className="joined-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === 'nav' ? <path d="M12 3 5 20l7-4 7 4z" /> : <path d="m5 12.5 4.5 4.5L19 7.5" />}
    </svg>
  )
}

/**
 * "Bu Maya added you" (Figma VD): the supervisor added the volunteer, here is where to go and the first task.
 * The distance is worked out here from the phone's position. The meet point, the wind and the team role are not
 * shown, because the API sends none of them.
 */
export function ApprovedJoinedView({
  lang,
  incident,
  task,
  position,
  action,
  onOnMyWay,
}: {
  lang: Lang
  incident: IncidentSummary | null
  task: Task
  position: DevicePosition
  action: ActionState
  onOnMyWay: () => void
}) {
  const arrival = arrivalOf(position, incident ? { lat: incident.lat, lng: incident.lng } : null)
  const reach = arrival.kind === 'far' || arrival.kind === 'there' ? arrival : null
  const distance = reach ? formatDistance(reach.distanceM) : null
  const accepted = Boolean(task.acceptedAt)
  return (
    <>
      <section className="joined-banner" aria-labelledby="joined-title" data-testid="joined-banner">
        <p className="joined-tag">
          {t(lang, copy.joinedTag)}
          {task.sentAt ? ` · ${formatTime(task.sentAt)}` : ''}
        </p>
        <h2 id="joined-title" className="joined-title">
          {t(lang, copy.youAreOn)} {incident ? incidentLabel(incident, lang) : t(lang, screenStrings.detail.title)}
        </h2>
      </section>

      <ul className="joined-steps">
        <li data-testid="joined-go">
          <Icon kind="nav" />
          <strong>
            {t(lang, copy.goTo)}
            {reach && distance ? `, ${distance.value} ${distance.unit} ${compassLabel(reach.compass, lang)}` : ''}
          </strong>
        </li>
        <li data-testid="joined-task">
          <Icon kind="check" />
          <span>
            <strong>{t(lang, copy.firstTask)}</strong>
            <span className="joined-sub">{task.instruction || t(lang, screenStrings.task.noInstruction)}</span>
          </span>
        </li>
      </ul>

      {accepted ? (
        <>
          <p className="notice ok" role="status" data-testid="on-my-way-done">{t(lang, copy.onMyWayDone)}</p>
          <Link className="pill ink big" to={`/pwa/incidents/${encodeURIComponent(task.incidentId)}`}>{t(lang, copy.openIncident)}</Link>
        </>
      ) : (
        <button type="button" className="pill ink big" disabled={action.kind === 'busy'} onClick={onOnMyWay} data-testid="on-my-way">
          {t(lang, copy.onMyWay)}
        </button>
      )}
      {action.kind === 'failed' && <p className="error" role="alert">{t(lang, screenStrings.task.saveFailed)}</p>}
      <p className="joined-foot">{t(lang, copy.joinedFoot)}</p>
    </>
  )
}

/** The route `/pwa/incidents/:id/joined`. Without a join instruction on this incident there is nothing to show. */
export function ApprovedJoinedScreen() {
  const { lang } = useLanguage()
  const { api, digest, refresh, position } = useVolunteer()
  const { id = '' } = useParams()
  const [action, setAction] = useState<ActionState>({ kind: 'idle' })

  if (!digest) return <p className="muted" role="status">{t(lang, screenStrings.common.loading)}</p>
  const task = joinTask(digest.myTasks, id)
  if (!task) return <Navigate to="/pwa" replace />

  const onMyWay = () => {
    setAction({ kind: 'busy' })
    api
      .acceptTask(task.id)
      .then(() => {
        setAction({ kind: 'idle' })
        refresh()
      })
      .catch((error: unknown) => setAction(error instanceof ApiError && error.status === 409 ? { kind: 'idle' } : { kind: 'failed' }))
  }
  return <ApprovedJoinedView lang={lang} incident={findIncident(digest, id)} task={task} position={position} action={action} onOnMyWay={onMyWay} />
}

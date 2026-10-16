import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import type { IncidentDetail, IncidentMembership, Task } from '../contracts/types'
import { formatTime } from '../formatTime'
import { incidentLabel } from '../incidentName'
import { t, type Lang } from '../i18n'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { distanceM, formatDistance } from './geo'
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
export function JoinedView({ lang, detail, liveDistanceLabel, enRouteAt, busy, error, onMyWay }: JoinedViewProps) {
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
export function JoinedScreen() {
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
    ? `${liveDistance.value} ${liveDistance.unit === 'km' ? t(lang, screenStrings.nearby.km) : t(lang, screenStrings.nearby.m)}`
    : null

  return (
    <JoinedView
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

import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { ApiError } from '../api/types'
import type { IncidentSummary, Task } from '../contracts/types'
import { formatTime } from '../formatTime'
import { t, type Lang } from '../i18n'
import { incidentLabel } from '../incidentName'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import type { ActionState } from './actionState'
import { arrivalOf, type DevicePosition } from './arrival'
import { compassLabel, formatDistance } from './geo'
import { findIncident, joinTask } from './incidentsView'
import { screenStrings } from './strings'

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
export function JoinedView({
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
export function JoinedScreen() {
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
  return <JoinedView lang={lang} incident={findIncident(digest, id)} task={task} position={position} action={action} onOnMyWay={onMyWay} />
}

import { Link, useNavigate, useParams } from 'react-router-dom'

import type { IncidentSummary, Task } from '../contracts/types'
import { formatTime } from '../formatTime'
import { TalkCard } from '../gateway/TalkCard'
import { strings, t, type Lang } from '../i18n'
import { incidentLabel, incidentLabelById } from '../incidentName'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { ARRIVAL_RADIUS_M, arrivalOf, isSpotTask, type Arrival, type DevicePosition } from './arrival'
import { compassLabel, formatDistance } from './geo'
import { findIncident, findTask } from './incidentsView'
import { MiniMap, type MapMarker } from './MiniMap'
import { screenStrings } from './strings'
import { useDevicePosition } from './useDevicePosition'
import type { ActionState } from './actionState'
import type { TalkView } from '../gateway/voiceView'
import { TaskCompletionPanel } from './TaskCompletionPanel'

const s = screenStrings

function Head({ lang, title, onBack }: { lang: Lang; title: string; onBack: () => void }) {
  return (
    <div className="screen-head">
      <button type="button" className="back" onClick={onBack} aria-label={t(lang, s.common.back)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 5-7 7 7 7" />
        </svg>
      </button>
      <h2>{title}</h2>
    </div>
  )
}

function arrivalHint(arrival: Arrival, lang: Lang): string | null {
  switch (arrival.kind) {
    case 'waiting':
      return t(lang, s.task.waitingGps)
    case 'denied':
      return t(lang, s.task.gpsDenied)
    case 'unavailable':
      return t(lang, s.task.gpsUnavailable)
    case 'far':
      return `${t(lang, s.task.walkCloser)} ${ARRIVAL_RADIUS_M} ${t(lang, s.task.meters)}.`
    default:
      return null
  }
}

/** Task detail (#138): where to go, how far, and a report button that turns on only at the spot. */
export function TaskDetailView({
  lang,
  task,
  incident,
  position,
  onBack,
  embedded = false,
}: {
  lang: Lang
  task: Task
  incident: IncidentSummary | null
  position: DevicePosition
  onBack: () => void
  embedded?: boolean
}) {
  const target = incident ? { lat: incident.lat, lng: incident.lng } : null
  const arrival = arrivalOf(position, target)
  const hint = arrivalHint(arrival, lang)
  const reached = arrival.kind === 'far' || arrival.kind === 'there' ? arrival : null
  const markers: MapMarker[] = []
  if (target) markers.push({ id: 'target', kind: 'target', ...target, label: t(lang, s.task.checkHere) })
  if (position.kind === 'ok') markers.push({ id: 'you', kind: 'you', lat: position.lat, lng: position.lng, label: t(lang, s.detail.you) })
  const there = arrival.kind === 'there'

  return (
    <>
      {!embedded && <Head lang={lang} title={t(lang, s.task.title)} onBack={onBack} />}
      <p className="section-label" data-testid="task-kicker">
        {t(lang, strings.taskType[task.type])}
        {task.sentAt ? ` · ${t(lang, s.task.from)} ${formatTime(task.sentAt)}` : ''}
      </p>
      <h3 className="incident-title" data-testid="task-instruction">{task.instruction || t(lang, s.task.noInstruction)}</h3>
      {markers.length > 0 && <MiniMap markers={markers} lang={lang} caption={t(lang, s.task.mapCaption)} />}
      {reached && (
        <ul className="stats two" data-testid="task-stats">
          <li className="stat">
            <strong>{formatDistance(reached.distanceM).value}</strong>
            <span>{formatDistance(reached.distanceM).unit === 'm' ? t(lang, s.task.toGo) : t(lang, s.task.toGoKm)}</span>
          </li>
          <li className="stat">
            <strong>{compassLabel(reached.compass, lang)}</strong>
            <span>{t(lang, s.task.direction)}</span>
          </li>
        </ul>
      )}
      {there ? (
        <a className="btn primary report-cta" href="#task-details-label" data-testid="im-there">
          {t(lang, s.task.imThere)}
        </a>
      ) : (
        <button type="button" className="btn primary" disabled data-testid="im-there">
          {t(lang, s.task.imThere)}
        </button>
      )}
      {hint && <p className="muted small" data-testid="arrival-hint" role="status">{hint}</p>}
      <div className="task-actions">
        <Link className="btn secondary report-cta" to={`/pwa/task/${encodeURIComponent(task.id)}/not-a-fire`}>
          {t(lang, s.task.notAFire)}
        </Link>
        <Link className="btn secondary report-cta" to={`/pwa/task/${encodeURIComponent(task.id)}/decline`}>
          {t(lang, s.task.cantDoIt)}
        </Link>
      </div>
      <p className="muted small">{t(lang, s.task.answerGoes)}</p>
    </>
  )
}

/** On the fire (#136): the supervisor's instruction is the order. Doing it and Can't do it answer it. */
export function OnTheFireView({
  lang,
  task,
  incident,
  talk,
  action,
  onDoingIt,
  onBack,
  embedded = false,
}: {
  lang: Lang
  task: Task
  incident: IncidentSummary | null
  talk: { view: TalkView; onPress: () => void; onRelease: () => void }
  action: ActionState
  onDoingIt: () => void
  onBack: () => void
  embedded?: boolean
}) {
  const accepted = Boolean(task.acceptedAt)
  const declined = Boolean(task.declinedAt)
  return (
    <>
      {!embedded && <Head lang={lang} title={t(lang, s.task.title)} onBack={onBack} />}
      <p className="on-fire" data-testid="on-fire-line">
        <span className="row-dot sev-small_flame" aria-hidden="true" />
        {incident ? incidentLabel(incident) : incidentLabelById(task.incidentId, [])}
        {incident ? ` · ${t(lang, s.severity[incident.severity])}` : ''}
      </p>
      <section className="card order" aria-labelledby="order-label">
        <p id="order-label" className="section-label">
          {t(lang, s.task.fromSupervisor)}
          {task.sentAt ? ` · ${formatTime(task.sentAt)}` : ''}
        </p>
        <h3 className="incident-title" data-testid="task-instruction">{task.instruction || t(lang, s.task.noInstruction)}</h3>
        {declined ? (
          <p className="notice" role="status" data-testid="declined-note">{t(lang, s.task.declinedDone)}</p>
        ) : accepted ? (
          <div className="notice ok" role="status" data-testid="accepted-note"><p>{t(lang, s.task.doingItDone)}</p>{task.acceptResponse && <p>{t(lang, s.accept.responses[task.acceptResponse])}</p>}{task.acceptNote && <p>{task.acceptNote}</p>}<Link to={`/pwa/task/${encodeURIComponent(task.id)}/decline`}>{t(lang, s.task.cantDoIt)}</Link></div>
        ) : (
          <div className="task-actions">
            <button type="button" className="btn ink" disabled={action.kind === 'busy'} onClick={onDoingIt} data-testid="doing-it">
              {t(lang, s.task.doingIt)}
            </button>
            <Link className="btn secondary report-cta" to={`/pwa/task/${encodeURIComponent(task.id)}/decline`} data-testid="cant-do-it">
              {t(lang, s.task.cantDoIt)}
            </Link>
          </div>
        )}
        {action.kind === 'failed' && <p className="error" role="alert">{t(lang, s.task.saveFailed)}</p>}
      </section>
      <p className="muted small">{t(lang, s.task.safetyRule)}</p>
      {!embedded && <TalkCard lang={lang} view={talk.view} onPress={talk.onPress} onRelease={talk.onRelease} />}
    </>
  )
}

export function TaskScreen() {
  const { lang } = useLanguage()
  const { digest, talk } = useVolunteer()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const task = findTask(digest, id)
  const incident = task ? findIncident(digest, task.incidentId) : null
  const position = useDevicePosition(task !== null && isSpotTask(task.type))
  const back = () => navigate(-1)

  if (!task || task.status !== 'approved') {
    return (
      <>
        <Head lang={lang} title={t(lang, s.task.title)} onBack={back} />
        <section className="card" data-testid="task-not-found" role="status">
          <h3>{t(lang, s.task.notFoundTitle)}</h3>
          <p className="muted">{t(lang, s.task.notFoundBody)}</p>
          <Link className="btn secondary" to="/pwa/incidents">{t(lang, s.incidents.backToList)}</Link>
        </section>
      </>
    )
  }

  if (task.closedAt) return <><Head lang={lang} title={t(lang, s.task.title)} onBack={back} /><p className="notice ok" role="status">{lang === 'en' ? 'Task completed. Your supervisor has the details.' : 'Tugas selesai. Supervisor telah menerima rinciannya.'}</p><Link className="btn secondary" to="/pwa/incidents">{t(lang, s.incidents.backToList)}</Link></>

  return <>
    <Head lang={lang} title={t(lang, s.task.title)} onBack={back} />
    {isSpotTask(task.type)
      ? <TaskDetailView embedded lang={lang} task={task} incident={incident} position={position} onBack={back} />
      : <OnTheFireView embedded lang={lang} task={task} incident={incident} talk={talk} action={{ kind: 'idle' }} onDoingIt={() => navigate(`/pwa/task/${encodeURIComponent(task.id)}/accept`)} onBack={back} />}
    {!task.declinedAt && <TaskCompletionPanel key={task.id} task={task} />}
  </>
}

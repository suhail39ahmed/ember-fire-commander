import { Link, useNavigate, useParams } from 'react-router-dom'

import type { IncidentDetail } from '../contracts/types'
import { formatTime } from '../formatTime'
import { t, type Lang } from '../i18n'
import { incidentLabel } from '../incidentName'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { reportTitle } from './reportTitle'
import { MiniMap, type MapMarker } from './MiniMap'
import { screenStrings } from './strings'
import { useIncidentDetail, type DetailState } from './useIncidentDetail'

function mapMarkers(detail: IncidentDetail, volunteerId: string | null, lang: Lang): MapMarker[] {
  const markers: MapMarker[] = [
    { id: 'fire', kind: 'fire', lat: detail.incident.lat, lng: detail.incident.lng, label: t(lang, screenStrings.detail.fire) },
  ]
  const mine = detail.observations.filter((o) => o.volunteerId === volunteerId)
  const latestMine = [...mine].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0]
  if (latestMine) markers.push({ id: `you-${latestMine.id}`, kind: 'you', lat: latestMine.lat, lng: latestMine.lng, label: t(lang, screenStrings.detail.you) })
  for (const o of detail.observations) {
    if (o.volunteerId === volunteerId) continue
    markers.push({ id: `other-${o.id}`, kind: 'other', lat: o.lat, lng: o.lng, label: t(lang, screenStrings.detail.other) })
  }
  return markers
}

/** The incident from the volunteer's side (#144): status, the conflict when reports disagree, a position sketch and the reports. */
export function IncidentDetailView({
  state,
  lang,
  volunteerId,
  incidentId,
  onRetry,
  onBack,
}: {
  state: DetailState
  lang: Lang
  volunteerId: string | null
  incidentId: string
  onRetry: () => void
  onBack: () => void
}) {
  const header = (
    <div className="screen-head">
      <button type="button" className="back" onClick={onBack} aria-label={t(lang, screenStrings.common.back)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 5-7 7 7 7" />
        </svg>
      </button>
      <h2>{t(lang, screenStrings.detail.title)}</h2>
    </div>
  )

  if (state.kind === 'loading') {
    return (
      <>
        {header}
        <div className="skeleton" aria-busy="true" data-testid="detail-skeleton">
          <p className="vol-sr-only" role="status">{t(lang, screenStrings.common.loading)}</p>
          <div className="sk sk-row" />
          <div className="sk sk-card" />
          <div className="sk sk-row" />
        </div>
      </>
    )
  }
  if (state.kind === 'not-found') {
    return (
      <>
        {header}
        <section className="card" data-testid="detail-not-found" role="status">
          <h3>{t(lang, screenStrings.detail.notFoundTitle)}</h3>
          <p className="muted">{t(lang, screenStrings.detail.notFoundBody)}</p>
          <Link className="btn secondary" to="/pwa/incidents">{t(lang, screenStrings.incidents.backToList)}</Link>
        </section>
      </>
    )
  }
  if (state.kind === 'error') {
    return (
      <>
        {header}
        <section className="card error-card" role="alert" data-testid="detail-error">
          <p>{t(lang, screenStrings.detail.loadFailed)}</p>
          {state.retryable && <button type="button" className="btn secondary" onClick={onRetry}>{t(lang, screenStrings.common.retry)}</button>}
        </section>
      </>
    )
  }

  const { detail } = state
  const { incident } = detail
  const held = incident.status === 'held'
  const disagree = detail.conflict !== null && detail.conflict.status === 'open'
  const reports = [...detail.observations].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
  const score = incident.evidenceScore

  return (
    <>
      {header}
      <div className="chips">
        <span className={`chip-status st-${incident.status}`}>
          {held ? t(lang, screenStrings.detail.heldChip) : t(lang, screenStrings.status[incident.status])}
        </span>
        <span className="chip-status">{t(lang, screenStrings.severity[incident.severity])}</span>
      </div>
      <h3 className="incident-title">{incidentLabel(incident)}</h3>
      {typeof score === 'number' && (
        <p className="muted small mono" data-testid="detail-evidence">
          {t(lang, screenStrings.detail.evidence)} {score} · {t(lang, screenStrings.detail.notProbability)}
        </p>
      )}

      {disagree && (
        <section className="card conflict" data-testid="detail-conflict" role="status">
          <h3>{t(lang, screenStrings.detail.conflictTitle)}</h3>
          <p>{t(lang, screenStrings.detail.conflictBody)}</p>
        </section>
      )}

      <MiniMap markers={mapMarkers(detail, volunteerId, lang)} lang={lang} caption={t(lang, screenStrings.detail.mapCaption)} />

      <section aria-labelledby="reports-title">
        <h3 id="reports-title" className="reports-head">
          {t(lang, screenStrings.detail.reportsHeading)} · {reports.length}
          <span className="muted small mono">HH:MM</span>
        </h3>
        {reports.length === 0 ? (
          <p className="muted" data-testid="detail-no-reports">{t(lang, screenStrings.detail.noReports)}</p>
        ) : (
          <ul className="rows">
            {reports.map((o) => (
              <li key={o.id} className="report-row" data-testid={`report-${o.id}`}>
                <span className="report-time mono">{formatTime(o.capturedAt)}</span>
                <span className="row-text">
                  <strong>{reportTitle(o, lang)}</strong>
                  <span className="muted small mono">
                    {o.volunteerId === volunteerId ? t(lang, screenStrings.detail.youTag) : t(lang, screenStrings.detail.otherTag)} ·{' '}
                    {t(lang, screenStrings.detail.source[o.source])}
                    {typeof o.accuracyM === 'number' ? ` · ±${o.accuracyM} m` : ''}
                  </span>
                  {o.volunteerId !== volunteerId && (
                    <Link className="flag-link small" to={`/pwa/incidents/${encodeURIComponent(incidentId)}/flag/${encodeURIComponent(o.id)}`} data-testid={`flag-${o.id}`}>
                      {t(lang, screenStrings.flag.action)}
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link className="btn primary report-cta" to="/pwa/report" state={{ incidentId }} data-testid="report-from-here">
        {t(lang, screenStrings.detail.reportFromHere)}
      </Link>
    </>
  )
}

export function IncidentDetailScreen() {
  const { lang } = useLanguage()
  const { api, volunteerId } = useVolunteer()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { state, reload } = useIncidentDetail(api, id)
  return <IncidentDetailView state={state} lang={lang} volunteerId={volunteerId} incidentId={id} onRetry={reload} onBack={() => navigate(-1)} />
}

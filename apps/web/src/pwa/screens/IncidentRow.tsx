import { Link } from 'react-router-dom'

import type { IncidentSummary } from '../contracts/types'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import { incidentLabel } from '../incidentName'
import { screenStrings } from './strings'
import { formatTime } from '../formatTime'
import { incidentDate, incidentTitle } from './incidentPresentation'
import { SeverityBadge, StatusBadge } from './IncidentBadges'

/** One incident in a list: name, place, status and severity. Opens the incident detail. */
export function IncidentRow({ incident, lang, card = false }: { incident: IncidentSummary; lang: Lang; card?: boolean }) {
  if (card) {
    const closed = incident.status === 'extinguished'
    const date = incidentDate(closed ? incident.closedAt : incident.updatedAt, lang)
    const s = screenStrings.incidents
    return <li><Link className="incident-card" to={`/pwa/incidents/${encodeURIComponent(incident.id)}`} data-testid={`incident-${incident.id}`}>
      <div className="incident-card-top"><StatusBadge incident={incident} lang={lang} />
        {date && <span className="incident-meta">{t(lang, closed ? s.closedLabel : s.updated)} {closed ? date : formatTime(incident.updatedAt!)}</span>}
      </div>
      <strong className="incident-card-title">{incidentTitle(incident)}</strong>
      <div className="incident-card-bottom"><SeverityBadge severity={incident.severity} lang={lang} />
        {closed && typeof incident.reportCount === 'number' ? <span className="incident-card-note">{t(lang, screenStrings.status.extinguished)} · {t(lang, s.reportsAttached(incident.reportCount))}</span>
          : typeof incident.participantCount === 'number' && incident.participantCount > 0 ? <span className="incident-card-note">{t(lang, s.participants(incident.participantCount, incident.includesMe === true))}</span>
            : typeof incident.myReportCount === 'number' && <span className="incident-card-note">{t(lang, s.myReports(incident.myReportCount))}</span>}
      </div>
    </Link></li>
  }
  const area = incident.area?.trim()
  return (
    <li>
      <Link className="row" to={`/pwa/incidents/${encodeURIComponent(incident.id)}`} data-testid={`incident-${incident.id}`}>
        <span className={`row-dot sev-${incident.severity}`} aria-hidden="true" />
        <span className="row-text">
          <strong>{incidentLabel(incident)}</strong>
          <span className="muted small">
            {t(lang, screenStrings.severity[incident.severity])}
            {area ? ` · ${area}` : ''}
          </span>
        </span>
        <span className={`chip-status st-${incident.status}`}>{t(lang, screenStrings.status[incident.status])}</span>
      </Link>
    </li>
  )
}

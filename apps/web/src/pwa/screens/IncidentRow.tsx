import { Link } from 'react-router-dom'

import type { IncidentSummary } from '../contracts/types'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import { incidentLabel } from '../incidentName'
import { screenStrings } from './strings'

/** One incident in a list: name, place, status and severity. Opens the incident detail. */
export function IncidentRow({ incident, lang }: { incident: IncidentSummary; lang: Lang }) {
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

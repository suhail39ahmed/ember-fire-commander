import type { IncidentSummary, Severity } from '../contracts/types'
import { t, type Lang } from '../i18n'
import { screenStrings } from './strings'

export function SeverityBadge({ severity, lang }: { severity: Severity; lang: Lang }) {
  return <span className={`incident-severity severity-${severity}`}><i aria-hidden="true" />{t(lang, screenStrings.severity[severity])}</span>
}

export function StatusBadge({ incident, lang }: { incident: IncidentSummary; lang: Lang }) {
  return <span className={`incident-status status-${incident.status}`}><i aria-hidden="true" />{t(lang, incident.status === 'held' ? screenStrings.detail.heldChip : screenStrings.status[incident.status])}</span>
}

import type { IncidentSummary } from '../contracts/types'
import { incidentLabel } from '../incidentName'
import type { Lang } from '../i18n'

export function incidentTitle(incident: IncidentSummary): string {
  return incident.code && incident.placeName ? `${incident.code} · ${incident.placeName}` : incidentLabel(incident)
}

export function incidentDate(value: string | null | undefined, lang: Lang): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short' }).format(new Date(value))
}

import { t, type Lang } from '../pwa/i18n'
import { incidentLabel } from '../pwa/incidentName'
import { approvalsCopy } from './approvalsCopy'
import type { ProposedTask } from './contracts'

/** The incident's heading: its stored name or area, else the label ember-api built. Never an id. */
export function approvalIncidentLabel(item: ProposedTask, lang: Lang): string {
  const incident = item.incident
  if (!incident) return t(lang, approvalsCopy.noIncident)
  return incident.name?.trim() || incident.area?.trim() ? incidentLabel(incident, lang) : incident.label
}

/** Tasks in the order ember-api sent them, gathered under their incident. */
export function groupByIncident(items: ProposedTask[]): Array<{ key: string; items: ProposedTask[] }> {
  const groups: Array<{ key: string; items: ProposedTask[] }> = []
  for (const item of items) {
    const key = item.incident?.id ?? item.task.incidentId
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, items: [item] })
  }
  return groups
}

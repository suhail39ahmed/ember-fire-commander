/**
 * The "Need help" chip (`butuh_bantuan`) is a volunteer asking for help, not a fire severity.
 * Every value here comes from stored reports; nothing is guessed. The report has no "answered" state, so a
 * help report stays listed. A supervisor reads it, replies, and the report stays in the history.
 */
import type { IncidentDetail } from '../contracts'
import { nameOf } from './model'

export const HELP_CHIP = 'butuh_bantuan'

export interface HelpRequest {
  /** The report's id, so a report is listed once. */
  id: string
  volunteerId: string
  name: string
  at: string
  text: string | null
}

/** Help reports, newest first. Reads the reports the detail lists and the timeline, which also holds the ones a conflict leaves out. */
export function helpRequests(detail: Pick<IncidentDetail, 'observations' | 'volunteers' | 'timeline'>, lang: 'id' | 'en'): HelpRequest[] {
  const found = new Map<string, HelpRequest>()
  for (const o of detail.observations) {
    if (o.chip !== HELP_CHIP) continue
    found.set(o.id, { id: o.id, volunteerId: o.volunteerId, name: nameOf(detail, o.volunteerId, lang), at: o.capturedAt, text: o.text?.trim() || null })
  }
  for (const e of detail.timeline ?? []) {
    if (e.kind !== 'report' || e.chip !== HELP_CHIP || !e.volunteerId || found.has(e.id)) continue
    found.set(e.id, { id: e.id, volunteerId: e.volunteerId, name: nameOf(detail, e.volunteerId, lang), at: e.at, text: e.text?.trim() || null })
  }
  return [...found.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id))
}

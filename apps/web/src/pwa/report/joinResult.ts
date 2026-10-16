import type { ChipValue, IncidentDetail } from '../contracts/types'
import { incidentLabel } from '../incidentName'

export interface SentReport {
  volunteerId: string
  /** When the phone sent it (ISO). */
  at: string
  chip: ChipValue | null
  text: string
}

export interface JoinResult {
  incidentId: string
  label: string
  /** The incident's other reports, counted from ember-api's list. 0 means this report started it. */
  others: number
}

/** A report counts as this one when it arrived within this long of the send. */
const WINDOW_BEFORE_MS = 60_000
const WINDOW_AFTER_MS = 15 * 60_000

/**
 * Which incident did this report end up in? ember-api does not say in the create response (fusion places it a
 * moment later), so the phone looks for its own report, by sender, chip, note and arrival time, in the incidents
 * it can read. The numbers are the incident's own report list. Nothing here guesses a distance or a radius.
 */
export function findJoin(sent: SentReport, details: IncidentDetail[]): JoinResult | null {
  const at = Date.parse(sent.at)
  if (!Number.isFinite(at)) return null
  let best: { result: JoinResult; receivedAt: number } | null = null
  for (const detail of details) {
    const mine = detail.observations.filter((o) => {
      const received = Date.parse(o.receivedAt)
      return (
        o.volunteerId === sent.volunteerId &&
        o.chip === sent.chip &&
        (o.text ?? '').trim() === sent.text.trim() &&
        Number.isFinite(received) &&
        received >= at - WINDOW_BEFORE_MS &&
        received <= at + WINDOW_AFTER_MS
      )
    })
    for (const o of mine) {
      const received = Date.parse(o.receivedAt)
      if (!best || received > best.receivedAt) {
        best = { receivedAt: received, result: { incidentId: detail.incident.id, label: incidentLabel(detail.incident), others: detail.observations.length - 1 } }
      }
    }
  }
  return best?.result ?? null
}

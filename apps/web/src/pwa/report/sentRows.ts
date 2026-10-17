import type { ChipValue, ObservationSource, SentReport } from '../contracts/types'
import { joinResultOf, type JoinResult } from './joinResult'
import type { SentEntry } from './sentLog'

/** One line of "Sent today": ember-api's row when it has the report, else the phone's own entry. */
export interface SentRow {
  key: string
  /** When it was sent or captured (ISO). */
  at: string
  kind: 'sent' | 'queued'
  source: ObservationSource
  chip: ChipValue | null
  text: string
  accuracyM: number | null
  join: JoinResult | null
}

const sameInstant = (a: string | null, b: string) => a !== null && Date.parse(a) === Date.parse(b)

/**
 * Today's reports for this volunteer, oldest first: everything ember-api lists, plus the phone's own entries that
 * ember-api does not list yet (a report still waiting in the outbox, or one stored a moment ago). An entry that
 * ember-api lists is shown once, as ember-api's row, with the phone's join kept when the API's row has none yet.
 */
export function sentRows(local: SentEntry[], remote: SentReport[] | null, lang: 'id' | 'en'): SentRow[] {
  const listed = remote ?? []
  const rows: SentRow[] = listed.map((r) => {
    const mine = local.find((e) => sameInstant(e.capturedAt, r.capturedAt))
    return {
      key: r.id,
      at: r.capturedAt,
      kind: 'sent',
      source: r.source,
      chip: r.chip,
      text: r.text ?? '',
      accuracyM: r.accuracyM,
      join: r.join ? joinResultOf(r.join, lang) : (mine?.join ?? null),
    }
  })
  for (const e of local) {
    if (e.capturedAt && listed.some((r) => sameInstant(e.capturedAt, r.capturedAt))) continue
    rows.push({ key: `local-${e.at}`, at: e.at, kind: e.kind, source: e.chip ? 'chip' : 'text', chip: e.chip, text: e.text, accuracyM: e.accuracyM, join: e.join })
  }
  return rows.sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0) || a.key.localeCompare(b.key))
}

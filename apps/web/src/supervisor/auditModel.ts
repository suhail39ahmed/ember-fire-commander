import { formatDay } from '../pwa/formatTime'
import type { AuditEntry } from './api/types'

/** Newest first. Rows with the same time keep a fixed order by id, so the list never flickers. */
export function newestFirst(items: AuditEntry[]): AuditEntry[] {
  return [...items].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0) || b.id.localeCompare(a.id))
}

export interface AuditDay {
  /** "16 Oct 2026", in the viewer's time zone. */
  day: string
  items: AuditEntry[]
}

/** Rows grouped under their calendar day, newest day first. A row with an unreadable time lands under an empty heading. */
export function groupByDay(items: AuditEntry[]): AuditDay[] {
  const days: AuditDay[] = []
  for (const entry of newestFirst(items)) {
    const day = formatDay(entry.at)
    const last = days[days.length - 1]
    if (last && last.day === day) last.items.push(entry)
    else days.push({ day, items: [entry] })
  }
  return days
}

import type { ChipValue } from '../contracts/types'
import { strings, t, type Lang } from '../i18n'

/** Where a report is in its life. The success cards are separate from the status line. */
export type ReportStatus =
  | { kind: 'idle' }
  /** Waiting for the position, which may mean waiting for the volunteer to answer the browser prompt. */
  | { kind: 'locating' }
  | { kind: 'sending' }
  /** `sent`: the supervisor has it. `queued`: kept on the phone. `at` is an ISO timestamp, formatted when shown; `chip` and `text` are what was sent. */
  | { kind: 'sent' | 'queued'; at: string; /** The `capturedAt` stamped on the report. */ capturedAt: string; chip: ChipValue | null; text: string }
  | { kind: 'error'; message: string; retryable: boolean; location?: 'denied' | 'unavailable' }

export type StatusTone = 'muted' | 'busy' | 'error'

/**
 * The one line under the Send button. Its space is always reserved, so
 * changing it never moves the form. Pending is neutral; red is only for a real failure.
 */
export function statusLine(status: ReportStatus, lang: Lang, hasDraft = true): { tone: StatusTone; text: string } {
  switch (status.kind) {
    case 'locating':
      return { tone: 'busy', text: t(lang, strings.locating) }
    case 'error':
      return { tone: 'error', text: status.message }
    case 'idle':
      return hasDraft ? { tone: 'muted', text: t(lang, strings.locationNote) } : { tone: 'muted', text: t(lang, strings.sendHint) }
    default:
      return { tone: 'muted', text: t(lang, strings.locationNote) }
  }
}

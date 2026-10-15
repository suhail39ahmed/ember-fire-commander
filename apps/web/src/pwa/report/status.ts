import { strings, t, type Lang } from '../i18n'

/** Where a report is in its life. The success cards are separate from the status line. */
export type ReportStatus =
  | { kind: 'idle' }
  /** Waiting for the position, which may mean waiting for the volunteer to answer the browser prompt. */
  | { kind: 'locating' }
  | { kind: 'sending' }
  | { kind: 'sent'; at: string }
  | { kind: 'queued' }
  | { kind: 'error'; message: string; retryable: boolean; location?: 'denied' | 'unavailable' }

export type StatusTone = 'muted' | 'busy' | 'error'

/**
 * The one line under the Send button. Its space is always reserved, so
 * changing it never moves the form. Pending is neutral; red is only for a real failure.
 */
export function statusLine(status: ReportStatus, lang: Lang): { tone: StatusTone; text: string } {
  switch (status.kind) {
    case 'locating':
      return { tone: 'busy', text: t(lang, strings.locating) }
    case 'error':
      return { tone: 'error', text: status.message }
    default:
      return { tone: 'muted', text: t(lang, strings.locationNote) }
  }
}

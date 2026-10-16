import type { ChipValue } from '../contracts/types'
import { formatTime } from '../formatTime'
import { strings, t, type Lang } from '../i18n'
import { outboxStrings } from '../outbox/strings'
import { chipText } from './chips'
import { screenStrings } from '../screens/strings'

interface Props {
  lang: Lang
  /** `sent`: the supervisor has it. `queued`: saved on the phone until there is signal. */
  kind: 'sent' | 'queued'
  /** ISO timestamp of the send. The time is formatted here, when the card is drawn. */
  at: string
  chip: ChipValue | null
  text: string
  onNew: () => void
  /** The incident this report is in, once ember-api shows it. Without it the card says nothing about an incident. */
  incident?: { label: string; others: number } | null
  /** Leaves the report screen for Home. Without it the card has no Done button. */
  onDone?: () => void
}

/** Replaces the report form after a send, so the same report cannot be sent twice by accident. */
export function SentCard({ lang, kind, at, chip, text, onNew, incident = null, onDone }: Props) {
  const note = text.trim()
  const c = screenStrings.sentCard
  const started = incident !== null && incident.others === 0
  return (
    <div className={`sent${kind === 'queued' ? ' queued' : ''}`} role="status">
      <strong>{started ? `${t(lang, c.started)} ${incident?.label}` : t(lang, kind === 'sent' ? strings.sent : outboxStrings.queuedTitle)}</strong>
      <span>
        {formatTime(at)} · {t(lang, kind === 'sent' ? strings.sentDetail : outboxStrings.queuedReport)}
        {incident ? ` · ${incident.label}` : ''}
      </span>
      {(chip || note) && (
        <p className="sent-summary" aria-label={t(lang, strings.sentSummary)}>
          {chip && <span className="sent-chip">{chipText(chip, lang)}</span>}
          {note && <span className="sent-note">“{note}”</span>}
        </p>
      )}
      {incident && (
        <p className="sent-join" data-testid="sent-join">
          {started
            ? t(lang, c.startedLine)
            : `${t(lang, c.joinedLine)} ${incident.label}. ${incident.others} ${t(lang, incident.others === 1 ? c.otherReport : c.otherReports)}.`}
        </p>
      )}
      <div className="sent-actions">
        <button type="button" className="btn secondary" onClick={onNew}>
          {t(lang, strings.newReport)}
        </button>
        {onDone && (
          <button type="button" className="btn ink" onClick={onDone} data-testid="sent-done">
            {t(lang, c.done)}
          </button>
        )}
      </div>
    </div>
  )
}

import type { ChipValue } from '../contracts/types'
import { formatTime } from '../formatTime'
import { strings, t, type Lang } from '../i18n'
import { outboxStrings } from '../outbox/strings'
import { chipText } from './chips'
import { screenStrings } from '../screens/strings'
import type { JoinResult } from './joinResult'
import { joinSentence } from './joinText'

interface Props {
  lang: Lang
  /** `sent`: the supervisor has it. `queued`: saved on the phone until there is signal. */
  kind: 'sent' | 'queued'
  /** ISO timestamp of the send. The time is formatted here, when the card is drawn. */
  at: string
  chip: ChipValue | null
  text: string
  onNew: () => void
  /** Where agents placed this report, once ember-api shows it. Without it the card says nothing about an incident. */
  join?: JoinResult | null
  /** Leaves the report screen for Home. Without it the card has no Done button. */
  onDone?: () => void
}

/** Replaces the report form after a send, so the same report cannot be sent twice by accident. */
export function SentCard({ lang, kind, at, chip, text, onNew, join = null, onDone }: Props) {
  const note = text.trim()
  const c = screenStrings.sentCard
  const started = join !== null && !join.joined
  return (
    <div className={`sent${kind === 'queued' ? ' queued' : ''}`} role="status">
      <strong>{started ? `${t(lang, c.started)} ${join?.label}` : t(lang, kind === 'sent' ? strings.sent : outboxStrings.queuedTitle)}</strong>
      <span>
        {formatTime(at)} · {t(lang, kind === 'sent' ? strings.sentDetail : outboxStrings.queuedReport)}
        {join ? ` · ${join.label}` : ''}
      </span>
      {(chip || note) && (
        <p className="sent-summary" aria-label={t(lang, strings.sentSummary)}>
          {chip && <span className="sent-chip">{chipText(chip, lang)}</span>}
          {note && <span className="sent-note">“{note}”</span>}
        </p>
      )}
      {join && (
        <p className="sent-join" data-testid="sent-join">
          {joinSentence(lang, join)}
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

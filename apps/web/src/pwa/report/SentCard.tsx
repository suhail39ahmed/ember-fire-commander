import type { ChipValue } from '../contracts/types'
import { formatTime } from '../formatTime'
import { strings, t, type Lang } from '../i18n'
import { outboxStrings } from '../outbox/strings'
import { chipText } from './chips'

interface Props {
  lang: Lang
  /** `sent`: the supervisor has it. `queued`: saved on the phone until there is signal. */
  kind: 'sent' | 'queued'
  /** ISO timestamp of the send. The time is formatted here, when the card is drawn. */
  at: string
  chip: ChipValue | null
  text: string
  onNew: () => void
}

/** Replaces the report form after a send, so the same report cannot be sent twice by accident. */
export function SentCard({ lang, kind, at, chip, text, onNew }: Props) {
  const note = text.trim()
  return (
    <div className={`sent${kind === 'queued' ? ' queued' : ''}`} role="status">
      <strong>{t(lang, kind === 'sent' ? strings.sent : outboxStrings.queuedTitle)}</strong>
      <span>
        {formatTime(at)} · {t(lang, kind === 'sent' ? strings.sentDetail : outboxStrings.queuedReport)}
      </span>
      {(chip || note) && (
        <p className="sent-summary" aria-label={t(lang, strings.sentSummary)}>
          {chip && <span className="sent-chip">{chipText(chip, lang)}</span>}
          {note && <span className="sent-note">“{note}”</span>}
        </p>
      )}
      <button type="button" className="btn secondary" onClick={onNew}>
        {t(lang, strings.newReport)}
      </button>
    </div>
  )
}

import { t, type Lang } from '../i18n'
import { formatTime } from '../formatTime'
import { gatewayStrings } from './gatewayStrings'
import './talk.css'

export type CoachPhase = 'idle' | 'replying' | 'done'

/**
 * Coach reply after a spoken report is saved (#130). Numbers and incident codes are only
 * shown when the API already has them — never invented from the model.
 */
export function CoachReply({
  lang,
  phase,
  replyText,
  receivedAt,
  incidentLabel,
}: {
  lang: Lang
  phase: CoachPhase
  replyText: string | null
  receivedAt: string | null
  incidentLabel: string | null
}) {
  if (phase === 'idle') return null
  return (
    <section className="card coach-reply" data-testid="coach-reply" aria-live="polite">
      <p className="section-label">{t(lang, phase === 'replying' ? gatewayStrings.replying : gatewayStrings.replyDone)}</p>
      {replyText ? <p className="coach-text">{replyText}</p> : <p className="muted">{t(lang, gatewayStrings.replyWaiting)}</p>}
      {(receivedAt || incidentLabel) && (
        <p className="muted small" data-testid="coach-receipt">
          {receivedAt ? formatTime(receivedAt) : null}
          {receivedAt && incidentLabel ? ' · ' : null}
          {incidentLabel}
        </p>
      )}
      <p className="muted small">{t(lang, gatewayStrings.replyHint)}</p>
    </section>
  )
}

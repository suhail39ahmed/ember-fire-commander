import { t, type Lang } from '../i18n'
import { formatTime } from '../formatTime'
import { gatewayStrings } from './gatewayStrings'
import './talk.css'

export type CoachPhase = 'idle' | 'replying' | 'done'

/**
 * Coach reply card after a spoken report is saved (#130). It is model output, so the label says AI.
 * The reply text only comes from the gateway; while it has not arrived the card says it is waiting.
 */
export function CoachReply({
  lang,
  phase,
  replyText,
}: {
  lang: Lang
  phase: CoachPhase
  replyText: string | null
  /** The receipt line is CoachReceipt; these are accepted so a caller can pass the whole coach state. */
  receivedAt?: string | null
  incidentLabel?: string | null
}) {
  if (phase === 'idle') return null
  return (
    <section className="coach-reply" data-testid="coach-reply" data-phase={phase} aria-live="polite">
      <p className="coach-label">{t(lang, gatewayStrings.coachLabel)}</p>
      {replyText ? <p className="coach-text">{replyText}</p> : <p className="coach-text coach-waiting">{t(lang, gatewayStrings.replyWaiting)}</p>}
    </section>
  )
}

/**
 * "Saved as a report · code · time", shown under Hold to talk. Numbers and incident codes are only shown when the API
 * already has them — never invented from the model.
 */
export function CoachReceipt({
  lang,
  phase,
  receivedAt,
  incidentLabel,
}: {
  lang: Lang
  phase: CoachPhase
  receivedAt: string | null
  incidentLabel: string | null
}) {
  if (phase === 'idle' || (!receivedAt && !incidentLabel)) return null
  const parts = [t(lang, gatewayStrings.savedAsReport), incidentLabel, receivedAt ? formatTime(receivedAt) : null].filter(Boolean)
  return (
    <p className="coach-receipt" data-testid="coach-receipt">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
      {parts.join(' · ')}
    </p>
  )
}

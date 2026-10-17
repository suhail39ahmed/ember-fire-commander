import { formatTimeZone } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import type { ConflictContext, IncidentDetail } from '../contracts'
import { chipLabel } from '../../pwa/report/chips'
import { actionText, actorOf, subjectOf } from './cardModel'
import { detailCopy, severityName } from './copy'
import { volunteerLabel } from './model'
import { disagreeCopy } from './disagreeCopy'
import { ReportCard } from './ReportCard'
import './extras.css'

/**
 * Beside the two sides of a disagreement: every report the incident holds (the reports on neither side when an older
 * API sends no full list), and the decisions recorded about it. All come from the supervisor read as stored.
 * An older API sends no context and nothing is drawn.
 */
export function ConflictExtras({ lang, detail, context }: { lang: Lang; detail: IncidentDetail; context: ConflictContext | null | undefined }) {
  if (!context) return null
  const everyReport = context.allObservations ?? []
  // The "when did it open" gap is only true when code recorded no `conflict.open` row for this disagreement.
  const openedRecorded = context.audit.some((e) => e.action === 'conflict.open')
  return (
    <>
      {everyReport.length > 0 ? (
        <section className="inc-card" aria-labelledby="dis-all-title">
          <h2 className="inc-h2" id="dis-all-title">
            {t(lang, disagreeCopy.allTitle)}
            <span className="inc-h2-note">{everyReport.length} · {t(lang, disagreeCopy.allNote)}</span>
          </h2>
          <ol className="inc-timeline dis-all">
            {everyReport.map((o) => {
              const chip = o.chip ? chipLabel(o.chip, lang) : null
              const name = o.volunteerName?.trim() || volunteerLabel(o.volunteerId, lang)
              return (
                <li key={o.id}>
                  <time dateTime={o.capturedAt}>{formatTimeZone(o.capturedAt)}</time>
                  <span>
                    <strong>{name}</strong> · {chip ? chip.primary : t(lang, detailCopy.source[o.source])} · {t(lang, severityName[o.severity])}
                    {o.text ? ` · “${o.text}”` : ''}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      ) : (
        context.otherObservations.length > 0 && (
          <section aria-labelledby="dis-other-title">
            <h2 className="inc-h2" id="dis-other-title">
              {t(lang, disagreeCopy.otherTitle)}
              <span className="inc-h2-note">{context.otherObservations.length} · {t(lang, disagreeCopy.otherNote)}</span>
            </h2>
            <div className="inc-pair">
              {context.otherObservations.map((o) => <ReportCard key={o.id} lang={lang} obs={o} />)}
            </div>
          </section>
        )
      )}
      <section className="inc-card" aria-labelledby="dis-decisions-title">
        <h2 className="inc-h2" id="dis-decisions-title">
          {t(lang, disagreeCopy.decisionsTitle)}
          <span className="inc-h2-note">{t(lang, disagreeCopy.decisionsNote)}</span>
        </h2>
        {context.audit.length === 0 ? (
          <p className="inc-muted">{t(lang, disagreeCopy.decisionsEmpty)}</p>
        ) : (
          <ol className="inc-timeline dis-decisions">
            {context.audit.map((e) => (
              <li key={e.id}>
                <time dateTime={e.at}>{formatTimeZone(e.at)}</time>
                <span>
                  {actorOf(detail, e, lang)} · {actionText(lang, e)}
                  {subjectOf(detail, e, lang) && ` · ${subjectOf(detail, e, lang)}`}
                </span>
              </li>
            ))}
          </ol>
        )}
        {!openedRecorded && <p className="inc-muted">{t(lang, disagreeCopy.openedGap)}</p>}
      </section>
    </>
  )
}

import { formatTime } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import type { ConflictContext, IncidentDetail } from '../contracts'
import { actionText, actorOf, subjectOf } from './cardModel'
import { disagreeCopy } from './disagreeCopy'
import { ReportCard } from './ReportCard'
import './extras.css'

/**
 * Beside the two sides of a disagreement: the reports that are on neither side, and the decisions recorded about it.
 * Both come from the supervisor read as stored. An older API sends no context and nothing is drawn.
 */
export function ConflictExtras({ lang, detail, context }: { lang: Lang; detail: IncidentDetail; context: ConflictContext | null | undefined }) {
  if (!context) return null
  return (
    <>
      {context.otherObservations.length > 0 && (
        <section aria-labelledby="dis-other-title">
          <h2 className="inc-h2" id="dis-other-title">
            {t(lang, disagreeCopy.otherTitle)}
            <span className="inc-h2-note">{context.otherObservations.length} · {t(lang, disagreeCopy.otherNote)}</span>
          </h2>
          <div className="inc-pair">
            {context.otherObservations.map((o) => <ReportCard key={o.id} lang={lang} obs={o} />)}
          </div>
        </section>
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
                <time dateTime={e.at}>{formatTime(e.at)}</time>
                <span>
                  {actorOf(detail, e, lang)} · {actionText(lang, e)}
                  {subjectOf(detail, e, lang) && ` · ${subjectOf(detail, e, lang)}`}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="inc-muted">{t(lang, disagreeCopy.openedGap)}</p>
      </section>
    </>
  )
}

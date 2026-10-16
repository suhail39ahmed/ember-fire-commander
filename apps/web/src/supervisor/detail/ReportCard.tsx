import { formatTimeZone } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import { chipLabel } from '../../pwa/report/chips'
import type { Observation } from '../contracts'
import { detailCopy, severityName, taskCopy } from './copy'
import { disagreeCopy } from './disagreeCopy'
import { volunteerLabel } from './model'
import './disagree.css'

/**
 * One stored report, shown unchanged. Two of these sit side by side when reports disagree:
 * nothing here is merged, averaged or edited.
 */
export function ReportCard({ lang, obs }: { lang: Lang; obs: Observation }) {
  const name = obs.volunteerName?.trim() || volunteerLabel(obs.volunteerId, lang)
  const chip = obs.chip ? chipLabel(obs.chip, lang) : null
  return (
    <article className="rep" aria-label={`${t(lang, taskCopy.reportFrom)} ${name}`}>
      <header className="rep-head">
        <h3 className="rep-name">{name}</h3>
        <p className="rep-meta">
          <time dateTime={obs.capturedAt}>{formatTimeZone(obs.capturedAt)}</time> · ±{obs.accuracyM ?? '?'} m
        </p>
      </header>
      <div className="rep-pills">
        {chip && (
          <span className="rep-chip">
            <strong>{chip.primary}</strong>
            {chip.secondary && <small>{chip.secondary}</small>}
          </span>
        )}
        <span className="inc-pill">
          <i className={`inc-dot sev-${obs.severity}`} aria-hidden="true" />
          {t(lang, severityName[obs.severity])}
        </span>
      </div>
      <p className="rep-quote">
        {obs.text ? `“${obs.text}”` : t(lang, detailCopy.noReportText)} · {t(lang, detailCopy.source[obs.source])}
      </p>
      <p className="rep-original">{t(lang, disagreeCopy.original)}</p>
    </article>
  )
}

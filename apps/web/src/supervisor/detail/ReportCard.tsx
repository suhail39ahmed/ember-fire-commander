import { formatTime } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import { chipText } from '../../pwa/report/chips'
import type { Observation } from '../contracts'
import { detailCopy, severityName, taskCopy } from './copy'
import { volunteerLabel } from './model'

/** One stored report, side by side with another when reports disagree. */
export function ReportCard({ lang, obs }: { lang: Lang; obs: Observation }) {
  const name = volunteerLabel(obs.volunteerId, lang)
  return (
    <article className="sup-obs" aria-label={`${t(lang, taskCopy.reportFrom)} ${name}`}>
      <p className="sup-obs-who">{name} · {formatTime(obs.capturedAt)}</p>
      <p className={`sup-sev sev-${obs.severity}`}>{t(lang, severityName[obs.severity])}</p>
      {obs.chip && <p className="sup-muted">{chipText(obs.chip, lang)}</p>}
      {obs.text && <p className="sup-obs-text">“{obs.text}”</p>}
      <p className="sup-muted">{t(lang, taskCopy.sourceLabel)}: {t(lang, detailCopy.source[obs.source])} · ±{obs.accuracyM ?? '?'} m</p>
    </article>
  )
}

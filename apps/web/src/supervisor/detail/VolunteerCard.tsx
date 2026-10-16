import { formatTime } from '../../pwa/formatTime'
import { chipText } from '../../pwa/report/chips'
import { t, type Lang } from '../../pwa/i18n'
import { detailCopy, severityName, taskStatusName } from './copy'
import { initialsOf, volunteerLabel, type VolunteerRow } from './model'

function reportLine(lang: Lang, row: VolunteerRow): string {
  const n = row.reportCount
  const time = row.latest ? formatTime(row.latest.capturedAt) : '--:--'
  const word = lang === 'id' ? 'laporan' : n === 1 ? 'report' : 'reports'
  return `${n} ${word} · ${time}`
}

/** One bulletin per volunteer, from their latest report and their last task. */
export function VolunteerCard({ lang, row }: { lang: Lang; row: VolunteerRow }) {
  const name = volunteerLabel(row.id, lang)
  const { latest, task } = row
  return (
    <article className={row.withdrawn ? 'inc-vol withdrawn' : 'inc-vol'} aria-label={name}>
      <header className="inc-vol-head">
        <span className="inc-avatar" aria-hidden="true">{initialsOf(name)}</span>
        <div className="inc-vol-id">
          <p className="inc-vol-name">{name}</p>
          <p className="inc-muted">{reportLine(lang, row)}</p>
        </div>
        {row.withdrawn && <span className="inc-pill inc-pill-red">{t(lang, detailCopy.withdrawSent)}</span>}
      </header>

      <section className="inc-vol-report" aria-label={t(lang, detailCopy.lastReport)}>
        {latest ? (
          <>
            <p className="inc-vol-sev">
              <span className={`inc-dot sev-${latest.severity}`} aria-hidden="true" />
              {t(lang, severityName[latest.severity])}
              {latest.chip && <span className="inc-muted"> · {chipText(latest.chip, lang)}</span>}
            </p>
            {latest.source === 'photo' && <p className="inc-muted">{t(lang, detailCopy.photoReport)}</p>}
            <p className="inc-vol-text">{latest.text ? `“${latest.text}”` : t(lang, detailCopy.noReportText)}</p>
            <p className="inc-muted">
              {t(lang, detailCopy.source[latest.source])} · ±{latest.accuracyM ?? '?'} m
            </p>
          </>
        ) : (
          <p className="inc-muted">{t(lang, detailCopy.noReport)}</p>
        )}
      </section>

      <section className="inc-vol-task" aria-label={t(lang, detailCopy.lastInstruction)}>
        {task ? (
          <>
            <p className="inc-vol-task-text">{task.instruction ?? '—'}</p>
            <p className="inc-muted">{t(lang, taskStatusName[task.status])}</p>
          </>
        ) : (
          <p className="inc-muted">{t(lang, detailCopy.noInstruction)}</p>
        )}
      </section>
    </article>
  )
}

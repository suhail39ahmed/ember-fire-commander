import { Link } from 'react-router-dom'

import type { SeasonStats, Task } from '../contracts/types'
import { formatTime } from '../formatTime'
import { t, type Lang } from '../i18n'
import { screenStrings } from './strings'

/**
 * Thank-you when a verify check is closed (#140). Counts and names come from the API only.
 */
export function LeadClosedScreen({
  lang,
  task,
  seasonStats,
  onDismiss,
}: {
  lang: Lang
  task: Task
  seasonStats: SeasonStats | null | undefined
  onDismiss: () => void
}) {
  const s = screenStrings.leadClosed
  const who = task.closedByName
  const when = task.closedAt ? formatTime(task.closedAt) : null
  const checks = seasonStats?.checksDone
  const cleared = seasonStats?.falseAlarmsCleared
  return (
    <section className="lead-closed" data-testid="lead-closed">
      <div className="lead-closed-card">
        <p className="section-label">
          {who ? `${who} ${t(lang, s.closedTheLead)}` : t(lang, s.closedTheLead)}
          {when ? ` · ${when}` : ''}
        </p>
        <h2>{task.closeMessage?.trim() || t(lang, s.defaultTitle)}</h2>
        <p className="muted">{t(lang, s.body)}</p>
      </div>
      {(checks != null || cleared != null) && (
        <ul className="lead-stats">
          {checks != null && (
            <li>
              <strong>{checks}</strong>
              <span>{t(lang, s.checks)}</span>
            </li>
          )}
          {cleared != null && (
            <li>
              <strong>{cleared}</strong>
              <span>{t(lang, s.falseAlarms)}</span>
            </li>
          )}
        </ul>
      )}
      <Link className="btn secondary" to="/pwa" onClick={onDismiss} data-testid="lead-closed-back">
        {t(lang, s.back)}
      </Link>
    </section>
  )
}

import { formatTime } from '../formatTime'
import { t, type Lang } from '../i18n'
import { screenStrings } from '../screens/strings'
import { chipLabel } from './chips'
import { joinShort } from './joinText'
import type { SentRow } from './sentRows'

const c = screenStrings.sentCard

function titleOf(lang: Lang, row: SentRow): string {
  const note = row.text.trim()
  if (note) return note
  if (row.chip) return chipLabel(row.chip, lang).primary
  if (row.source === 'photo') return t(lang, c.photoReport)
  if (row.source === 'live') return t(lang, c.liveReport)
  return ''
}

/** The reports this volunteer sent today, newest first (#131): ember-api's list, with the phone's own waiting reports. */
export function SentToday({ lang, rows }: { lang: Lang; rows: SentRow[] }) {
  if (rows.length === 0) return null
  const shown = [...rows].reverse()
  return (
    <section className="sent-today" aria-label={t(lang, c.sentToday)} data-testid="sent-today">
      <div className="sent-today-head">
        <h3>{t(lang, c.sentToday)}</h3>
        <span className="muted small">
          {rows.length} {t(lang, rows.length === 1 ? c.report : c.reports)}
        </span>
      </div>
      <ul className="card">
        {shown.map((row) => {
          const meta = [row.chip ? chipLabel(row.chip, lang).primary.toUpperCase() : null, row.join?.label, row.accuracyM !== null ? `±${Math.round(row.accuracyM)} M` : null].filter(Boolean).join(' · ')
          return (
            <li key={row.key}>
              <div>
                <strong>{titleOf(lang, row)}</strong>
                <span className="muted small mono">{meta}</span>
                {row.join && <span className="muted small sent-today-join">{joinShort(lang, row.join)}</span>}
              </div>
              <div className="sent-today-when">
                <strong>{formatTime(row.at)}</strong>
                <span className={row.kind === 'sent' ? 'ok small' : 'muted small'}>{row.kind === 'sent' ? `✓ ${t(lang, c.statusSent)}` : t(lang, c.statusQueued)}</span>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="muted small">{t(lang, c.onlyHere)}</p>
    </section>
  )
}

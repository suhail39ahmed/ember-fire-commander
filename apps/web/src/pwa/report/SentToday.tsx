import { formatTime } from '../formatTime'
import { t, type Lang } from '../i18n'
import { screenStrings } from '../screens/strings'
import { chipLabel } from './chips'
import type { SentEntry } from './sentLog'

const c = screenStrings.sentCard

/** The reports this phone sent today, newest first (#131). It is this phone's own record, and the card says so. */
export function SentToday({ lang, entries }: { lang: Lang; entries: SentEntry[] }) {
  if (entries.length === 0) return null
  const shown = [...entries].reverse()
  return (
    <section className="sent-today" aria-label={t(lang, c.sentToday)} data-testid="sent-today">
      <div className="sent-today-head">
        <h3>{t(lang, c.sentToday)}</h3>
        <span className="muted small">
          {entries.length} {t(lang, entries.length === 1 ? c.report : c.reports)}
        </span>
      </div>
      <ul className="card">
        {shown.map((e) => {
          const title = e.text.trim() || (e.chip ? chipLabel(e.chip, lang).primary : '')
          const meta = [e.chip ? chipLabel(e.chip, lang).primary.toUpperCase() : null, e.incidentLabel, e.accuracyM !== null ? `±${Math.round(e.accuracyM)} M` : null].filter(Boolean).join(' · ')
          return (
            <li key={e.at}>
              <div>
                <strong>{title}</strong>
                <span className="muted small mono">{meta}</span>
              </div>
              <div className="sent-today-when">
                <strong>{formatTime(e.at)}</strong>
                <span className={e.kind === 'sent' ? 'ok small' : 'muted small'}>{e.kind === 'sent' ? `✓ ${t(lang, c.statusSent)}` : t(lang, c.statusQueued)}</span>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="muted small">{t(lang, c.onlyHere)}</p>
    </section>
  )
}

import { t, type Lang } from '../pwa/i18n'
import { seasonCopy } from './seasonCopy'
import type { SeasonImpact as SeasonImpactData } from './chromeClient'

const EMPTY = '—'

export interface SeasonImpactProps {
  impact: SeasonImpactData | null
  loading: boolean
  retrying: boolean
  lang: Lang
}

function blank(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return EMPTY
  return String(value)
}

function Card({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="season-card">
      <p className="season-card-label">{label}</p>
      <p className="season-card-value">{value}</p>
      <p className="season-card-note">{note}</p>
    </article>
  )
}

/**
 * The five season-impact cards. They stay on the dashboard when no fire is live.
 * A failed refresh keeps the last picture.
 */
export function SeasonImpact({ impact, loading, retrying, lang }: SeasonImpactProps) {
  if (impact === null) {
    return (
      <section className="season" aria-label={t(lang, seasonCopy.title)}>
        <p className="season-updated" role="status">
          {retrying ? t(lang, seasonCopy.retryEmpty) : loading ? t(lang, seasonCopy.loading) : null}
        </p>
      </section>
    )
  }
  const cards = [
    { label: seasonCopy.firesContained, value: impact.firesContained, note: impact.firesContainedNote },
    { label: seasonCopy.falseAlarms, value: impact.falseAlarmsCleared, note: impact.falseAlarmsNote },
    { label: seasonCopy.injuries, value: impact.injuries, note: impact.injuriesNote },
    { label: seasonCopy.medianTime, value: impact.medianTimeToHumanCheck, note: impact.medianTimeNote },
    { label: seasonCopy.reignitions, value: impact.reignitionsCaught, note: impact.reignitionsNote },
  ]
  return (
    <section className="season" aria-label={t(lang, seasonCopy.title)}>
      <div className="season-head">
        <h2 className="season-title">{t(lang, seasonCopy.title)}</h2>
        <p className="season-meta">
          {t(lang, seasonCopy.since)} {blank(impact.since)} · {blank(impact.region)} · {blank(impact.crewCount)} {t(lang, seasonCopy.crews)}
        </p>
        <p className="season-how">{t(lang, seasonCopy.howWeCount)}</p>
      </div>
      <div className="season-cards">
        {cards.map((card) => (
          <Card key={card.label.en} label={t(lang, card.label)} value={blank(card.value)} note={blank(card.note)} />
        ))}
      </div>
      {retrying && <p className="season-retry" role="status">{t(lang, seasonCopy.retry)}</p>}
    </section>
  )
}

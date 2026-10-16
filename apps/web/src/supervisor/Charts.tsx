import { t, type Lang } from '../pwa/i18n'
import { chartCopy } from './chartCopy'
import type { DashboardCharts } from './chromeClient'

const EMPTY = '—'

export interface ChartsProps {
  charts: DashboardCharts | null
  loading: boolean
  retrying: boolean
  lang: Lang
}

function blank(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return EMPTY
  return String(value)
}

function Card({ title, note, children }: { title: string; note: string; children: string }) {
  return (
    <article className="chart-card">
      <h3 className="chart-title">{title}</h3>
      <p className="chart-note">{note}</p>
      <p className="chart-figure">{children}</p>
    </article>
  )
}

/**
 * The four dashboard chart cards. No bars are drawn while every series is null.
 * A failed refresh keeps the last picture.
 */
export function Charts({ charts, loading, retrying, lang }: ChartsProps) {
  if (charts === null) {
    return (
      <section className="charts" aria-label={t(lang, chartCopy.satellite)}>
        <p className="chart-status" role="status">
          {retrying ? t(lang, chartCopy.retryEmpty) : loading ? t(lang, chartCopy.loading) : null}
        </p>
      </section>
    )
  }
  const crewLines = [
    [chartCopy.onSite, charts.onSite],
    [chartCopy.enRoute, charts.enRoute],
    [chartCopy.ready, charts.ready],
    [chartCopy.offline, charts.offline],
  ] as const
  const weatherLines = [
    [chartCopy.airTemp, charts.airTempC],
    [chartCopy.humidity, charts.humidity],
    [chartCopy.wind, charts.wind],
    [chartCopy.rain, charts.rain],
  ] as const
  return (
    <section className="charts" aria-label={t(lang, chartCopy.satellite)}>
      <div className="chart-cards">
        <Card title={t(lang, chartCopy.satellite)} note={blank(charts.satelliteNote)}>
          {`${t(lang, chartCopy.days)} · ${EMPTY} · ${t(lang, chartCopy.realFires)} ${blank(charts.realFires)} · ${t(lang, chartCopy.dismissed)} ${blank(charts.dismissed)}`}
        </Card>
        <Card title={t(lang, chartCopy.median)} note={blank(charts.medianNote)}>
          {`${t(lang, chartCopy.today)} ${blank(charts.medianToday)} · ${t(lang, chartCopy.target)} ${blank(charts.medianTarget)}`}
        </Card>
        <Card title={t(lang, chartCopy.crews)} note={blank(charts.crewNote)}>
          {crewLines.map(([label, value]) => `${t(lang, label)} ${blank(value)}`).join(' · ')}
        </Card>
        <Card title={t(lang, chartCopy.weather)} note={blank(charts.weatherNote)}>
          {weatherLines.map(([label, value]) => `${t(lang, label)} ${blank(value)}`).join(' · ')}
        </Card>
      </div>
      {retrying && <p className="chart-status" role="status">{t(lang, chartCopy.retry)}</p>}
    </section>
  )
}

import { Link } from 'react-router-dom'

import { formatTimeZone } from '../pwa/formatTime'
import { t, type Lang } from '../pwa/i18n'
import { bannerCopy } from './bannerCopy'
import type { LiveFire } from './chromeClient'
import { consoleIncidentPath } from './paths'

const EMPTY = '—'

export interface LiveBannerProps {
  fires: LiveFire[] | null
  updatedAt: string | null
  nextSatellitePass: string | null
  loading: boolean
  retrying: boolean
  lang: Lang
}

function blank(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return EMPTY
  return String(value)
}

function firesNeedYou(count: number, lang: Lang): string {
  if (count === 1) return t(lang, bannerCopy.oneFire)
  return `${count} ${t(lang, bannerCopy.manyFires)}`
}

function LiveFireCard({ fire, lang }: { fire: LiveFire; lang: Lang }) {
  const middle = fire.liveCameras ?? fire.photoCadence
  const last = fire.distanceToRisk ?? (fire.since ? `${t(lang, bannerCopy.since)} ${formatTimeZone(fire.since)}` : null)
  return (
    <article className="live-fire">
      <div>
        <p className="live-fire-title">{blank(fire.code)} · {blank(fire.placeName)}</p>
        <p className="live-fire-id">{t(lang, bannerCopy.incident)} {fire.id}</p>
        <p className="live-fire-meta">
          {fire.peopleOnSite} {t(lang, bannerCopy.onSite)} · {blank(middle)} · {blank(last)}
        </p>
        {fire.withdrawActive && <p className="live-flag">{t(lang, bannerCopy.withdraw)}</p>}
      </div>
      <Link className="live-open" to={consoleIncidentPath(fire.id)}>
        {t(lang, bannerCopy.open)}
      </Link>
    </article>
  )
}

/**
 * The orange live-fire strip on the dashboard. Hidden when the latest read
 * has no open, held, or verified fires. A failed refresh keeps the last list.
 */
export function LiveBanner({ fires, updatedAt, nextSatellitePass, loading, retrying, lang }: LiveBannerProps) {
  if (fires === null) {
    return (
      <section className="live-banner" aria-label={t(lang, bannerCopy.live)}>
        <p className="live-updated" role="status">
          {retrying ? t(lang, bannerCopy.retryEmpty) : loading ? t(lang, bannerCopy.loading) : null}
        </p>
      </section>
    )
  }
  if (fires.length === 0 && !retrying) return null
  const updated = updatedAt ? formatTimeZone(updatedAt) : EMPTY
  const pass = nextSatellitePass ? formatTimeZone(nextSatellitePass) : EMPTY
  return (
    <section className="live-banner" aria-label={t(lang, bannerCopy.live)}>
      {fires.length > 0 && (
        <>
          <div className="live-banner-head">
            <span className="live-dot" aria-hidden="true" />
            <div>
              <p className="live-kicker">{t(lang, bannerCopy.live)} · {firesNeedYou(fires.length, lang)}</p>
              <p className="live-updated">
                {t(lang, bannerCopy.updated)} {updated} · {t(lang, bannerCopy.satellite)} {pass}
              </p>
            </div>
          </div>
          <div className="live-fires">
            {fires.map((fire) => <LiveFireCard key={fire.id} fire={fire} lang={lang} />)}
          </div>
        </>
      )}
      {retrying && (
        <p className="live-retry" role="status">
          {fires.length > 0 ? t(lang, bannerCopy.retry) : t(lang, bannerCopy.retryEmpty)}
        </p>
      )}
    </section>
  )
}

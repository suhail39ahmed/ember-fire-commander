import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { EmberApi } from '../api/types'
import type { NearbyIncident } from '../contracts/types'
import { incidentLabel } from '../incidentName'
import { t, type Lang } from '../i18n'
import { compassLabel, compassOf, formatDistance } from './geo'
import { MiniMap } from './MiniMap'
import { dismissNearby } from './nearbyDismiss'
import { screenStrings } from './strings'

export interface NearbyPromptProps {
  lang: Lang
  api: EmberApi
  volunteerId: string | null
  nearby: NearbyIncident
  /** Phone position for the mini map. Without it the map is omitted. */
  you: { lat: number; lng: number } | null
  onDismissed: () => void
  onJoined: () => void
}

/**
 * Fire near you (#134). One card on Home for the closest nearby incident the volunteer has not joined.
 * Wind/approach are hidden until the contract stores observed wind.
 */
export function NearbyPrompt({ lang, api, volunteerId, nearby, you, onDismissed, onJoined }: NearbyPromptProps) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const s = screenStrings.nearby
  const label = incidentLabel(nearby)
  const dist = formatDistance(nearby.distanceM)
  const compass = nearby.bearingDeg === null ? null : compassLabel(compassOf(nearby.bearingDeg), lang)
  const distLine =
    compass === null
      ? `${dist.value} ${dist.unit === 'km' ? t(lang, s.km) : t(lang, s.m)} ${t(lang, s.fromYou)}`
      : `${dist.value} ${dist.unit === 'km' ? t(lang, s.km) : t(lang, s.m)} ${compass} ${t(lang, s.ofYou)}`

  const crew =
    nearby.crewOnSite === 1
      ? `1 ${t(lang, s.crewOne)}`
      : `${nearby.crewOnSite} ${t(lang, s.crewMany)}`

  async function join() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await api.joinIncident(nearby.id)
      onJoined()
      navigate(`/pwa/joined/${encodeURIComponent(nearby.id)}`)
    } catch {
      setError(t(lang, s.joinFailed))
    } finally {
      setBusy(false)
    }
  }

  function notNow() {
    dismissNearby(volunteerId, nearby.id)
    onDismissed()
  }

  return (
    <section className="card nearby-prompt" aria-labelledby="nearby-title" data-testid="nearby-prompt">
      <p className="nearby-kicker">
        <span className="nearby-dot" aria-hidden="true" />
        {t(lang, s.reported)} {distLine}
      </p>
      <h2 id="nearby-title">{label}</h2>
      <p className="nearby-meta">
        {t(lang, screenStrings.severity[nearby.severity])}
        {' · '}
        {crew}
      </p>
      {you && (
        <div className="nearby-map">
          <MiniMap
            lang={lang}
            caption={t(lang, s.mapCaption)}
            markers={[
              { id: 'you', kind: 'you', lat: you.lat, lng: you.lng, label: t(lang, screenStrings.detail.you) },
              { id: nearby.id, kind: 'fire', lat: nearby.lat, lng: nearby.lng, label: label.split(' · ')[0] || label },
            ]}
          />
        </div>
      )}
      <button type="button" className="btn primary" disabled={busy} onClick={() => void join()} data-testid="nearby-join">
        {busy ? t(lang, s.joining) : t(lang, s.joinNow)}
      </button>
      <button type="button" className="btn link nearby-dismiss" disabled={busy} onClick={notNow} data-testid="nearby-dismiss">
        {t(lang, s.notNow)}
      </button>
      <p className="muted small nearby-hint">{t(lang, s.hint)}</p>
      {error && (
        <p className="nearby-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

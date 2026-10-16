import { useEffect, useRef, useState } from 'react'

import { t, type Lang } from '../../pwa/i18n'
import type { Incident } from '../contracts'
import { mapCopy } from './mapCopy'
import { hasMapsKey, MAPS_BROWSER_KEY, MAPS_MAP_ID } from './config'
import { loadMaps, type GCircle, type GMap, type GMarker, type MapsApi } from './loadMaps'
import { layerView } from './layers'
import { pinStyle, placeable, projectWithCrews, WITHDRAW_ZONE_M, type CrewDot } from './markers'
import { arrowDeg, windText, type WindReading } from './wind'
import './map.css'

const BOX_W = 640
const BOX_H = 300

export interface IncidentMapProps {
  incidents: Incident[]
  selectedId: string | null
  onSelect(id: string): void
  /** Override for tests and previews. Defaults to VITE_MAPS_BROWSER_KEY. */
  mapsKey?: string
  /** Dashboard layer toggles. Detail leaves this off. */
  showLayers?: boolean
  /** `full` fills the page, for the Map screen. The default sits inside the dashboard. */
  size?: 'panel' | 'full'
  /** Last positions of the open incident's volunteers, for the Crews layer. Empty when none is stored. */
  crews?: CrewDot[]
  /** The stored wind, for the Wind layer. Without it there is no Wind toggle. */
  wind?: WindReading | null
  lang?: Lang
}

function LayerToggles({
  firesOn,
  crewsOn,
  windOn,
  hasWind,
  onFires,
  onCrews,
  onWind,
  lang,
}: {
  firesOn: boolean
  crewsOn: boolean
  windOn: boolean
  hasWind: boolean
  onFires(): void
  onCrews(): void
  onWind(): void
  lang: Lang
}) {
  return (
    <div className="map-layers" role="group" aria-label={t(lang, mapCopy.title)}>
      <button type="button" className={firesOn ? 'map-layer on' : 'map-layer'} aria-pressed={firesOn} onClick={onFires}>
        {t(lang, mapCopy.fires)}
      </button>
      <button type="button" className={crewsOn ? 'map-layer on' : 'map-layer'} aria-pressed={crewsOn} onClick={onCrews}>
        {t(lang, mapCopy.crews)}
      </button>
      {hasWind && (
        <button type="button" className={windOn ? 'map-layer on' : 'map-layer'} aria-pressed={windOn} onClick={onWind}>
          {t(lang, mapCopy.wind)}
        </button>
      )}
      <span className="map-layer static">{t(lang, mapCopy.peat)} · {t(lang, mapCopy.staticLayer)}</span>
    </div>
  )
}

function Legend({ crews }: { crews: boolean }) {
  return (
    <div className="map-legend" aria-label="Map legend">
      <span><i className="dot sev-fire" /> Incident · colour is severity</span>
      <span><i className="dot ring-conflict" /> Same fire? · reports disagree</span>
      <span><i className="dot zone-withdraw" /> Withdraw zone · indicative</span>
      {crews && <span><i className="dot crew" /> Crew · last reported position</span>}
    </div>
  )
}

function pinElement(incident: Incident, selected: boolean): HTMLElement {
  const s = pinStyle(incident)
  const el = document.createElement('div')
  el.className = ['map-pin', s.conflict && 'conflict', s.withdraw && 'withdraw', s.verified && 'verified', selected && 'selected']
    .filter(Boolean)
    .join(' ')
  el.style.setProperty('--pin', s.color)
  el.textContent = s.badge ?? ''
  return el
}

/** Google map with the browser key: tiles, pins and withdraw rings only. */
function GoogleIncidentMap({ incidents, selectedId, onSelect, mapsKey, onFail, crews = [] }: IncidentMapProps & { mapsKey: string; onFail(): void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [api, setApi] = useState<MapsApi | null>(null)
  const mapRef = useRef<GMap | null>(null)
  const drawn = useRef<{ markers: GMarker[]; circles: GCircle[] }>({ markers: [], circles: [] })
  const crewMarkers = useRef<GMarker[]>([])
  const fitted = useRef(false)

  useEffect(() => {
    let live = true
    loadMaps(mapsKey).then((m) => live && setApi(m)).catch(() => live && onFail())
    return () => {
      live = false
    }
  }, [mapsKey, onFail])

  useEffect(() => {
    if (!api || !ref.current || mapRef.current) return
    mapRef.current = new api.Map(ref.current, {
      mapId: MAPS_MAP_ID,
      center: { lat: -1.85, lng: 110.05 },
      zoom: 11,
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: false,
    })
  }, [api])

  useEffect(() => {
    const map = mapRef.current
    if (!api || !map) return
    drawn.current.markers.forEach((m) => (m.map = null))
    drawn.current.circles.forEach((c) => c.setMap(null))
    const list = placeable(incidents)
    drawn.current = {
      markers: list.map((i) => {
        const marker = new api.AdvancedMarkerElement({
          map,
          position: { lat: i.lat, lng: i.lng },
          content: pinElement(i, i.id === selectedId),
          title: pinStyle(i).label,
          gmpClickable: true,
        })
        marker.addListener('click', () => onSelect(i.id))
        return marker
      }),
      circles: list
        .filter((i) => i.withdraw?.active)
        .map((i) => new api.Circle({
          map,
          center: { lat: i.lat, lng: i.lng },
          radius: WITHDRAW_ZONE_M,
          strokeColor: '#C81E1E',
          strokeOpacity: 0.8,
          strokeWeight: 1.5,
          fillColor: '#C81E1E',
          fillOpacity: 0.12,
          clickable: false,
        })),
    }
    if (!fitted.current && list.length > 0) {
      fitted.current = true
      if (list.length === 1) {
        map.setCenter({ lat: list[0].lat, lng: list[0].lng })
        map.setZoom(13)
      } else {
        const bounds = new api.LatLngBounds()
        list.forEach((i) => bounds.extend({ lat: i.lat, lng: i.lng }))
        map.fitBounds(bounds, 48)
      }
    }
  }, [api, incidents, selectedId, onSelect])

  useEffect(() => {
    const map = mapRef.current
    if (!api || !map) return
    crewMarkers.current.forEach((m) => (m.map = null))
    crewMarkers.current = crews.map((c) => {
      const el = document.createElement('div')
      el.className = 'map-crew'
      return new api.AdvancedMarkerElement({ map, position: { lat: c.lat, lng: c.lng }, content: el, title: c.name ?? 'Crew' })
    })
  }, [api, crews])

  useEffect(() => {
    const sel = incidents.find((i) => i.id === selectedId)
    if (sel && mapRef.current) mapRef.current.panTo({ lat: sel.lat, lng: sel.lng })
  }, [selectedId, incidents])

  return <div ref={ref} className="map-canvas" role="region" aria-label="Incident map" />
}

/** Schematic positions when there is no key or Maps fails. Same pins, no tiles. */
export function SchematicMap({ incidents, selectedId, onSelect, reason, crews = [] }: IncidentMapProps & { reason: string }) {
  const { incidents: points, crews: crewPoints } = projectWithCrews(incidents, crews, BOX_W, BOX_H)
  const crewById = new Map(crews.map((c) => [c.id, c]))
  const byId = new Map(incidents.map((i) => [i.id, i]))
  return (
    <div className="map-schematic" role="region" aria-label="Incident positions">
      <p className="map-note">{reason} Positions are relative, north up.</p>
      {crewPoints.map((p) => (
        <i
          key={p.id}
          className="map-crew"
          style={{ left: `${(p.x / BOX_W) * 100}%`, top: `${(p.y / BOX_H) * 100}%` }}
          title={crewById.get(p.id)?.name ?? 'Crew'}
        />
      ))}
      {points.map((p) => {
        const incident = byId.get(p.id)!
        const s = pinStyle(incident)
        return (
          <button
            key={p.id}
            type="button"
            className={['map-pin', s.conflict && 'conflict', s.withdraw && 'withdraw', s.verified && 'verified', p.id === selectedId && 'selected']
              .filter(Boolean)
              .join(' ')}
            style={{ left: `${(p.x / BOX_W) * 100}%`, top: `${(p.y / BOX_H) * 100}%`, ['--pin' as string]: s.color }}
            aria-label={s.label}
            aria-pressed={p.id === selectedId}
            title={s.label}
            onClick={() => onSelect(p.id)}
          >
            {s.badge ?? ''}
          </button>
        )
      })}
    </div>
  )
}

/** Incident locations for the console (issue #22). Selection is shared with the queue. */
export function IncidentMap(props: IncidentMapProps) {
  const key = props.mapsKey ?? MAPS_BROWSER_KEY
  const [failed, setFailed] = useState(false)
  const [onFail] = useState(() => () => setFailed(true))
  const [firesOn, setFiresOn] = useState(true)
  const [crewsOn, setCrewsOn] = useState(false)
  const [windOn, setWindOn] = useState(false)
  const lang = props.lang ?? 'en'
  const layers = Boolean(props.showLayers)
  const view = layerView({ showLayers: layers, firesOn, crewsOn, windOn }, props.incidents, props.crews ?? [], props.wind ?? null)
  const shown = view.incidents
  const crews = view.crews
  const wind = props.wind ?? null
  const count = placeable(props.incidents).length

  let body
  if (view.empty === 'firesOff') {
    body = <div className="map-empty" role="status">{t(lang, mapCopy.firesOff)}</div>
  } else if (view.empty === 'noPositions') {
    body = <div className="map-empty" role="status">No incident positions to show.</div>
  } else if (!hasMapsKey(key)) {
    body = <SchematicMap {...props} incidents={shown} crews={crews} reason="Map tiles are off (no browser key)." />
  } else if (failed) {
    body = <SchematicMap {...props} incidents={shown} crews={crews} reason="Map tiles could not load." />
  } else {
    body = <GoogleIncidentMap {...props} incidents={shown} crews={crews} mapsKey={key} onFail={onFail} />
  }

  return (
    <section className={props.size === 'full' ? 'sup-card map-card map-full' : 'sup-card map-card'} aria-label="Incident locations">
      <div className="map-head">
        <p className="sup-label">{layers ? t(lang, mapCopy.title) : 'INCIDENT LOCATIONS'}</p>
        <p className="sup-muted">{count} {count === 1 ? 'incident' : 'incidents'} · positions from ember-api</p>
      </div>
      {layers && (
        <LayerToggles
          firesOn={firesOn}
          crewsOn={crewsOn}
          windOn={windOn}
          hasWind={wind !== null}
          lang={lang}
          onFires={() => setFiresOn((on) => !on)}
          onCrews={() => setCrewsOn((on) => !on)}
          onWind={() => setWindOn((on) => !on)}
        />
      )}
      {view.wind && (
        <p className="map-wind" role="status">
          <span className="map-wind-arrow" style={{ transform: `rotate(${arrowDeg(view.wind.fromDeg)}deg)` }} aria-hidden="true">↑</span>
          {windText(view.wind, lang)}
        </p>
      )}
      {body}
      {view.crewsNone && <p className="map-empty-layer" role="status">{t(lang, mapCopy.crewsNone)}</p>}
      {crews.length > 0 && <p className="map-empty-layer">{crews.length} {t(lang, mapCopy.crewsShown)} · {t(lang, mapCopy.crews)}</p>}
      <Legend crews={crews.length > 0} />
      <p className="map-caveat">Guidance is indicative. EMBER does not forecast fire spread or haze.</p>
    </section>
  )
}

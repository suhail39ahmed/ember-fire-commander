import { useEffect, useRef, useState } from 'react'

import type { Incident } from '../contracts'
import { hasMapsKey, MAPS_BROWSER_KEY, MAPS_MAP_ID } from './config'
import { loadMaps, type GCircle, type GMap, type GMarker, type MapsApi } from './loadMaps'
import { pinStyle, placeable, project, WITHDRAW_ZONE_M } from './markers'
import './map.css'

const BOX_W = 640
const BOX_H = 300

export interface IncidentMapProps {
  incidents: Incident[]
  selectedId: string | null
  onSelect(id: string): void
  /** Override for tests and previews. Defaults to VITE_MAPS_BROWSER_KEY. */
  mapsKey?: string
}

function Legend() {
  return (
    <div className="map-legend" aria-label="Map legend">
      <span><i className="dot sev-fire" /> Incident · colour is severity</span>
      <span><i className="dot ring-conflict" /> Same fire? · reports disagree</span>
      <span><i className="dot zone-withdraw" /> Withdraw zone · indicative</span>
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
function GoogleIncidentMap({ incidents, selectedId, onSelect, mapsKey, onFail }: IncidentMapProps & { mapsKey: string; onFail(): void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [api, setApi] = useState<MapsApi | null>(null)
  const mapRef = useRef<GMap | null>(null)
  const drawn = useRef<{ markers: GMarker[]; circles: GCircle[] }>({ markers: [], circles: [] })
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
    const sel = incidents.find((i) => i.id === selectedId)
    if (sel && mapRef.current) mapRef.current.panTo({ lat: sel.lat, lng: sel.lng })
  }, [selectedId, incidents])

  return <div ref={ref} className="map-canvas" role="region" aria-label="Incident map" />
}

/** Schematic positions when there is no key or Maps fails. Same pins, no tiles. */
export function SchematicMap({ incidents, selectedId, onSelect, reason }: IncidentMapProps & { reason: string }) {
  const points = project(incidents, BOX_W, BOX_H)
  const byId = new Map(incidents.map((i) => [i.id, i]))
  return (
    <div className="map-schematic" role="region" aria-label="Incident positions">
      <p className="map-note">{reason} Positions are relative, north up.</p>
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
  const count = placeable(props.incidents).length

  let body
  if (count === 0) {
    body = <div className="map-empty" role="status">No incident positions to show.</div>
  } else if (!hasMapsKey(key)) {
    body = <SchematicMap {...props} reason="Map tiles are off (no browser key)." />
  } else if (failed) {
    body = <SchematicMap {...props} reason="Map tiles could not load." />
  } else {
    body = <GoogleIncidentMap {...props} mapsKey={key} onFail={onFail} />
  }

  return (
    <section className="sup-card map-card" aria-label="Incident locations">
      <div className="map-head">
        <p className="sup-label">INCIDENT LOCATIONS</p>
        <p className="sup-muted">{count} {count === 1 ? 'incident' : 'incidents'} · positions from ember-api</p>
      </div>
      {body}
      <Legend />
      <p className="map-caveat">Guidance is indicative. EMBER does not forecast fire spread or haze.</p>
    </section>
  )
}

import type { Lang } from '../i18n'
import { projectPoints, type MapPoint } from './geo'

export type MapKind = 'you' | 'fire' | 'other' | 'target'

export interface MapMarker extends MapPoint {
  kind: MapKind
  label: string
}

/**
 * A plain position sketch: real coordinates projected onto a flat square with north up. It is not a basemap, so it
 * carries no roads or canals and says nothing about terrain. The label under each dot is in the volunteer's language.
 */
export function MiniMap({ markers, lang, caption, compact = false }: { markers: MapMarker[]; lang: Lang; caption: string; compact?: boolean }) {
  const placed = projectPoints(markers)
  return (
    <figure className={`minimap${compact ? ' minimap-compact' : ''}`} data-testid="minimap" lang={lang}>
      <svg viewBox={compact ? '0 0 200 100' : '0 0 100 100'} role="img" aria-label={caption} preserveAspectRatio="xMidYMid meet">
        <rect x="0" y="0" width={compact ? 200 : 100} height="100" className="minimap-ground" />
        {(compact ? Array.from({ length: 19 }, (_, index) => (index + 1) * 10) : [25, 50, 75]).map((n) => (
          <g key={n} className="minimap-grid">
            <line x1={n} y1="0" x2={n} y2="100" />
            {n < 100 && <line x1="0" y1={n} x2={compact ? 200 : 100} y2={n} />}
          </g>
        ))}
        {markers.map((marker, i) => {
          const at = { x: placed[i].x + (compact ? 50 : 0), y: placed[i].y }
          return (
            <g key={marker.id} className={`minimap-dot dot-${marker.kind}`} data-testid={`map-${marker.kind}`}>
              {marker.kind === 'fire' || marker.kind === 'target' ? <circle cx={at.x} cy={at.y} r="9" className="ring" /> : null}
              <circle cx={at.x} cy={at.y} r="3.2" />
              <text x={at.x + 5} y={at.y + 1.5}>{marker.label}</text>
            </g>
          )
        })}
      </svg>
      <figcaption className="vol-sr-only">{caption}</figcaption>
    </figure>
  )
}

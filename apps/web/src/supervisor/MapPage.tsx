import { useMemo } from 'react'

import { t } from '../pwa/i18n'
import { useConsole } from './ConsoleProvider'
import { useIncidents } from './incidentsContext'
import { IncidentMap } from './map/IncidentMap'
import { crewDots } from './map/markers'
import { windReading } from './map/wind'
import { mapCopy } from './map/mapCopy'
import './supervisor.css'

/** Route element for `/console/map`: the incident map at full size. A pin opens its incident. */
export function MapPage() {
  const { queue, detail, loadError, activeId, select } = useIncidents()
  const { language, charts } = useConsole()
  const crews = useMemo(() => crewDots(detail && detail.incident.id === activeId ? detail.volunteers : null), [detail, activeId])
  const wind = useMemo(() => windReading(charts?.windKmh, charts?.windDirDeg), [charts])
  return (
    <div className="sup">
      <div className="sup-main">
        {loadError && <p className="sup-error" role="alert">{loadError}</p>}
        {queue === null ? (
          !loadError && <p className="sup-muted" role="status">{t(language, mapCopy.loading)}</p>
        ) : (
          <IncidentMap incidents={queue} selectedId={activeId} onSelect={select} showLayers size="full" crews={crews} wind={wind} lang={language} />
        )}
      </div>
    </div>
  )
}

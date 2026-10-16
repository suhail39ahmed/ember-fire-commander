import { t } from '../pwa/i18n'
import { useConsole } from './ConsoleProvider'
import { useIncidents } from './incidentsContext'
import { IncidentMap } from './map/IncidentMap'
import { mapCopy } from './map/mapCopy'
import './supervisor.css'

/** Route element for `/console/map`: the incident map at full size. A pin opens its incident. */
export function MapPage() {
  const { queue, loadError, activeId, select } = useIncidents()
  const { language } = useConsole()
  return (
    <div className="sup">
      <div className="sup-main">
        {loadError && <p className="sup-error" role="alert">{loadError}</p>}
        {queue === null ? (
          !loadError && <p className="sup-muted" role="status">{t(language, mapCopy.loading)}</p>
        ) : (
          <IncidentMap incidents={queue} selectedId={activeId} onSelect={select} showLayers size="full" lang={language} />
        )}
      </div>
    </div>
  )
}

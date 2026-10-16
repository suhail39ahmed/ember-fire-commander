import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { useConsole } from '../ConsoleProvider'
import { useIncidents } from '../incidentsContext'
import { incidentIdFromPath } from '../paths'
import { IncidentDetailView } from './IncidentDetailView'
import { linkState } from './model'

const RESTORED_MS = 3000

/** Route element for `/console/incidents/:incidentId`. Reads the shared incident state, draws the detail. */
export function IncidentDetailPage() {
  const { language } = useConsole()
  const { pathname } = useLocation()
  const { queue, detail, detailFailure, activeId, select, refresh, connection, actions } = useIncidents()
  const incidentId = incidentIdFromPath(pathname) ?? activeId ?? ''
  const [now, setNow] = useState(() => Date.now())
  const [restoredUntil, setRestoredUntil] = useState<number | null>(null)

  // Tick while the screen needs a clock: the "last update" age and the 3 s "back online" bar.
  useEffect(() => {
    if (!connection.lost && restoredUntil === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [connection.lost, restoredUntil])

  const wasLost = useRef(connection.lost)
  useEffect(() => {
    const before = wasLost.current
    wasLost.current = connection.lost
    if (!before || connection.lost) return
    setNow(Date.now())
    setRestoredUntil(Date.now() + RESTORED_MS)
    const timer = window.setTimeout(() => setRestoredUntil(null), RESTORED_MS)
    return () => window.clearTimeout(timer)
  }, [connection.lost])

  const open = detail && detail.incident.id === incidentId ? detail : null
  return (
    <IncidentDetailView
      lang={language}
      incidentId={incidentId}
      detail={open}
      queue={queue}
      failure={open ? null : detailFailure}
      link={linkState(connection.lost, restoredUntil, now)}
      lastOkAt={connection.lastOkAt}
      now={now}
      actions={actions}
      onRetry={() => void refresh()}
      onSelect={select}
    />
  )
}

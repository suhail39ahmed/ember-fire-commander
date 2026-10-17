import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { ApiError } from '../../pwa/api/types'
import { useConsole } from '../ConsoleProvider'
import { useIncidents } from '../incidentsContext'
import { incidentIdFromPath } from '../paths'
import { IncidentDetailView } from './IncidentDetailView'
import { linkState } from './model'

const RESTORED_MS = 3000

/** Route element for `/console/incidents/:incidentId`. Reads the shared incident state, draws the detail. */
export function IncidentDetailPage() {
  const { language, supervisor, clockSkewMs } = useConsole()
  const { pathname } = useLocation()
  const { queue, detail, detailFailure, activeId, select, api, refresh, connection, actions } = useIncidents()
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
      sendWithdraw={async (request) => {
        const result = await api.withdrawIncident(incidentId, request)
        await refresh()
        return result
      }}
      actorName={supervisor.displayName}
      serverNow={() => Date.now() + (clockSkewMs ?? 0)}
      lowerSeverity={async (severity) => {
        try {
          const result = await api.lowerSeverity(incidentId, severity)
          await refresh()
          return result
        } catch (error) {
          // 409: the severity moved since this screen last read it. Show the new one.
          if (error instanceof ApiError && error.status === 409) await refresh()
          throw error
        }
      }}
      clearWithdraw={async (reason) => {
        const w = open?.incident.withdraw
        const result = await api.clearWithdraw(incidentId, reason, w?.id ?? w?.sentAt)
        await refresh()
        return result
      }}
      requestHelp={async (volunteerId, helperId, instruction) => {
        const w = open?.incident.withdraw
        const result = await api.requestWithdrawHelp(incidentId, volunteerId, helperId, instruction, w?.id ?? w?.sentAt)
        await refresh()
        return result
      }}
      markSafe={async (volunteerId) => {
        try {
          const result = await api.markWithdrawSafe(incidentId, volunteerId, open?.incident.withdraw?.id)
          await refresh()
          return result
        } catch (error) {
          // 409: someone already marked this person, or the withdraw is gone. Show what is stored now.
          if (error instanceof ApiError && error.status === 409) await refresh()
          throw error
        }
      }}
      resendTask={async (taskId) => {
        try {
          const result = await api.resendTask(taskId)
          await refresh()
          return result
        } catch (error) {
          // 409: it was heard in the meantime. Show what is stored now.
          if (error instanceof ApiError && error.status === 409) await refresh()
          throw error
        }
      }}
      sendInstruction={async (volunteerId, instruction) => {
        try {
          const result = await api.sendInstruction(incidentId, volunteerId, instruction)
          await refresh()
          return result
        } catch (error) {
          // 409: a withdraw or an extinguish landed in the meantime. Show what is stored now.
          if (error instanceof ApiError && error.status === 409) await refresh()
          throw error
        }
      }}
      photoUrl={(id, observationId) => api.getPhotoUrl(id, observationId)}
      videoUrl={(id, observationId) => api.getVideoUrl(id, observationId)}
      assist={{
        suggest: async () => {
          const result = await api.suggestIncident(incidentId)
          await refresh()
          return result
        },
        ask: (question, volunteerId) => api.askIncident(incidentId, question, volunteerId),
        translate: async (observationId) => {
          const result = await api.translateObservation(incidentId, observationId)
          await refresh()
          return result
        },
      }}
      extinguish={async () => {
        try {
          const result = await api.extinguishIncident(incidentId)
          await refresh()
          return result
        } catch (error) {
          // 409: it is already out. Read it again so the screen shows that.
          if (error instanceof ApiError && error.status === 409) await refresh()
          throw error
        }
      }}
      makeLive={async (volunteerId) => {
        try {
          await api.makeLive(incidentId, volunteerId)
          await refresh()
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) await refresh()
          throw error
        }
      }}
      retryLive={async (volunteerId) => {
        try {
          await api.retryLive(incidentId, volunteerId)
          await refresh()
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) await refresh()
          throw error
        }
      }}
    />
  )
}

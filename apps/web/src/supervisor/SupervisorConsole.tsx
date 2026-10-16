import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { authHeadersFor } from '../pwa/api/authHeaders'
import { USE_MOCK_API } from '../pwa/api/config'
import { ApiError } from '../pwa/api/types'
import { createHttpSupervisorApi } from './api/client'
import { createMockSupervisorApi } from './api/mock'
import type { SupervisorApi } from './api/types'
import type { Incident, IncidentDetail } from './contracts'
import { IncidentQueue } from './IncidentQueue'
import { IncidentView, type Outcome } from './IncidentView'
import { IncidentsContext, POLL_MS, useIncidents, type DetailFailure, type IncidentsState } from './incidentsContext'
import { IncidentMap } from './map/IncidentMap'
import { incidentIdFromPath, consoleIncidentPath } from './paths'
import { flattenGroups, groupByArea } from './queueGroups'
import { sortQueue } from './view'
import './supervisor.css'



function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'network'
}

function failureOf(e: unknown): DetailFailure {
  if (isNetworkError(e)) return 'network'
  return e instanceof ApiError && e.status === 404 ? 'not_found' : 'failed'
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'network') return 'Could not reach ember-api. Nothing was changed.'
    return e.message
  }
  return 'Something went wrong. Nothing was changed.'
}

/**
 * Incident queue, map, and the open incident. State stays here, not in the
 * console chrome provider, and survives moving between /console and
 * /console/incidents/:id.
 */
export function IncidentsShell({ api: apiOverride, children }: { api?: SupervisorApi; children?: ReactNode }) {
  const { user, me } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const getAuthHeaders = useMemo(() => authHeadersFor(user), [user])
  const api = useMemo<SupervisorApi>(
    () => apiOverride ?? (USE_MOCK_API ? createMockSupervisorApi(me?.id ?? 'uid_mock', 'region') : createHttpSupervisorApi(getAuthHeaders)),
    [apiOverride, getAuthHeaders, me?.id],
  )
  const [queue, setQueue] = useState<Incident[] | null>(null)
  const [detail, setDetail] = useState<IncidentDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({})
  const [detailFailure, setDetailFailure] = useState<DetailFailure | null>(null)
  const [lost, setLost] = useState(false)
  const [lastOkAt, setLastOkAt] = useState<number | null>(null)

  const routeId = incidentIdFromPath(pathname)
  const activeId = routeId ?? queue?.[0]?.id ?? null

  const load = useCallback(async () => {
    try {
      const incidents = flattenGroups(groupByArea(sortQueue(await api.listIncidents())))
      setQueue(incidents)
      setLoadError(null)
      setLost(false)
      setLastOkAt(Date.now())
    } catch (e) {
      setLoadError(errorText(e))
      if (isNetworkError(e)) setLost(true)
    }
  }, [api])

  const loadDetail = useCallback(async (id: string | null) => {
    if (!id) {
      setDetail(null)
      setDetailFailure(null)
      return
    }
    try {
      setDetail(await api.getIncident(id))
      setDetailFailure(null)
    } catch (e) {
      setLoadError(errorText(e))
      setDetailFailure(failureOf(e))
      if (isNetworkError(e)) setLost(true)
    }
  }, [api])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    setDetailFailure(null)
  }, [activeId])

  useEffect(() => {
    void loadDetail(activeId)
  }, [activeId, queue, loadDetail])

  // The device going offline or coming back is a signal too. The next read decides what is true.
  useEffect(() => {
    const goOffline = () => setLost(true)
    const goOnline = () => void load()
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [load])

  const run = useCallback(
    async (targetId: string, call: () => Promise<string>) => {
      setBusyId(targetId)
      try {
        const text = await call()
        setOutcomes((o) => ({ ...o, [targetId]: { kind: 'ok', text } }))
      } catch (e) {
        setOutcomes((o) => ({ ...o, [targetId]: { kind: 'error', text: errorText(e) } }))
      } finally {
        setBusyId(null)
        await load()
      }
    },
    [load],
  )

  const select = useCallback((id: string) => {
    navigate(consoleIncidentPath(id))
  }, [navigate])

  const value = useMemo<IncidentsState>(() => ({
    queue,
    detail,
    loadError,
    detailFailure,
    activeId,
    select,
    api,
    refresh: load,
    connection: { lost, lastOkAt },
    actions: {
      busyId,
      outcomes,
      onApprove: (id: string) => void run(id, async () => {
        const r = await api.approveTask(id)
        return `Confirmed by ember-api: ${r.task.status} · audit ${r.auditId}`
      }),
      onReject: (id: string) => void run(id, async () => {
        const r = await api.rejectTask(id)
        return `Confirmed by ember-api: ${r.task.status} · audit ${r.auditId}`
      }),
      onEdit: (id: string, instruction: string) => void run(id, async () => {
        const r = await api.editTask(id, instruction)
        return `Instruction saved · audit ${r.auditId}`
      }),
      onVerify: (id: string) => void run(id, async () => {
        const r = await api.verifyIncident(id)
        return `Confirmed by ember-api: ${r.incident.status} · audit ${r.auditId}`
      }),
    },
  }), [queue, detail, loadError, detailFailure, activeId, select, busyId, outcomes, run, api, load, lost, lastOkAt])

  return (
    <IncidentsContext.Provider value={value}>
      {children ?? <Outlet />}
    </IncidentsContext.Provider>
  )
}

/** Temporary incidents content: the current queue, map, and incident, inside the console chrome. */
export function IncidentsPage() {
  const { queue, detail, loadError, activeId, select, actions } = useIncidents()
  const groups = useMemo(() => groupByArea(queue ?? []), [queue])
  return (
    <div className="sup">
      <div className="sup-main">
        {loadError && <p className="sup-error" role="alert">{loadError}</p>}
        {queue === null ? (
          <div className="sup-state" role="status">
            <p className="sup-state-title">Loading live incident…</p>
            <p className="sup-muted">Reports, conflicts and tasks</p>
          </div>
        ) : queue.length === 0 ? (
          <div className="sup-state">
            <p className="sup-label">Live incident</p>
            <p className="sup-state-title">No live incidents</p>
            <p className="sup-muted">When a volunteer reports a fire, the incident opens here with the reports and EMBER’s suggested tasks.</p>
          </div>
        ) : (
          <div className="sup-work">
            <IncidentQueue groups={groups} activeId={activeId} onSelect={select} />
            <div className="sup-work-detail">
              <IncidentMap incidents={queue} selectedId={activeId} onSelect={select} />
              {detail && detail.incident.id === activeId ? (
                <IncidentView key={detail.incident.id} detail={detail} actions={actions} />
              ) : !loadError ? (
                <div className="sup-state" role="status"><p className="sup-state-title">Loading live incident…</p></div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

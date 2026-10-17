import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useWithdrawUpdates } from '../pwa/withdraw/useWithdrawUpdates'
import { useAuth } from '../auth/AuthProvider'
import { authHeadersFor } from '../pwa/api/authHeaders'
import { USE_MOCK_API } from '../pwa/api/config'
import { ApiError } from '../pwa/api/types'
import { createHttpSupervisorApi } from './api/client'
import { createMockSupervisorApi } from './api/mock'
import type { SupervisorApi } from './api/types'
import type { Incident, IncidentDetail } from './contracts'
import { reasonOf } from './detail/outcomeCopy'
import { LiveBanner } from './LiveBanner'
import { UpdatedLine } from './UpdatedLine'
import { ReignitionAlertBanner } from './ReignitionAlert'
import { SeasonImpact } from './SeasonImpact'
import { Charts } from './Charts'
import { IncidentQueue } from './IncidentQueue'
import { IncidentView, type Outcome } from './IncidentView'
import { IncidentsContext, POLL_MS, useIncidents, type DetailFailure, type IncidentsState } from './incidentsContext'
import { IncidentMap } from './map/IncidentMap'
import { crewDots } from './map/markers'
import { windReading } from './map/wind'
import { incidentIdFromPath, consoleIncidentPath } from './paths'
import { useConsole } from './ConsoleProvider'
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

  useWithdrawUpdates(user, load, apiOverride === undefined)

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
    async (targetId: string, call: () => Promise<Outcome>) => {
      setBusyId(targetId)
      try {
        const outcome = await call()
        setOutcomes((o) => ({ ...o, [targetId]: outcome }))
      } catch (e) {
        setOutcomes((o) => ({ ...o, [targetId]: { kind: 'error', text: errorText(e), reason: reasonOf(e) } }))
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
        return { kind: 'ok', text: `Confirmed by ember-api: ${r.task.status} · audit ${r.auditId}`, action: 'approve', auditId: r.auditId }
      }),
      onReject: (id: string) => void run(id, async () => {
        const r = await api.rejectTask(id)
        return { kind: 'ok', text: `Confirmed by ember-api: ${r.task.status} · audit ${r.auditId}`, action: 'reject', auditId: r.auditId }
      }),
      saveEdit: async (id: string, instruction: string) => {
        try {
          return await api.editTask(id, instruction)
        } finally {
          // Success changes the text. A refusal may mean the task moved. Either way show what is stored.
          await load()
        }
      },
      onVerify: (id: string) => void run(id, async () => {
        const r = await api.verifyIncident(id)
        return { kind: 'ok', text: `Confirmed by ember-api: ${r.incident.status} · audit ${r.auditId}`, action: 'verify', auditId: r.auditId }
      }),
    },
  }), [queue, detail, loadError, detailFailure, activeId, select, busyId, outcomes, run, api, load, lost, lastOkAt])

  return (
    <IncidentsContext.Provider value={value}>
      {children ?? <Outlet />}
    </IncidentsContext.Provider>
  )
}

function DashboardLiveBanner() {
  const { pathname } = useLocation()
  const { liveFires, updatedAt, nextSatellitePass, bannerRetrying, chromeError, language } = useConsole()
  const { queue } = useIncidents()
  if (incidentIdFromPath(pathname) !== null) return null
  return (
    <LiveBanner
      fires={liveFires}
      updatedAt={updatedAt}
      nextSatellitePass={nextSatellitePass}
      loading={liveFires === null && chromeError === null}
      retrying={bannerRetrying}
      lang={language}
      queue={queue}
    />
  )
}

function DashboardUpdated() {
  const { liveFires, updatedAt, language } = useConsole()
  // With fires on screen the banner already says when it was updated.
  if (liveFires !== null && liveFires.length > 0) return null
  return <UpdatedLine updatedAt={updatedAt} lang={language} />
}

function DashboardReignitionAlert() {
  const { pathname } = useLocation()
  const { reignitionAlert, language, setReignitionAlert } = useConsole()
  if (incidentIdFromPath(pathname) !== null) return null
  return (
    <ReignitionAlertBanner
      alert={reignitionAlert}
      lang={language}
      onSent={(alert) => setReignitionAlert(alert)}
      onDismissed={() => setReignitionAlert(null)}
    />
  )
}

function DashboardSeasonImpact() {
  const { pathname } = useLocation()
  const { seasonImpact, bannerRetrying, chromeError, language } = useConsole()
  if (incidentIdFromPath(pathname) !== null) return null
  return (
    <SeasonImpact
      impact={seasonImpact}
      loading={seasonImpact === null && chromeError === null}
      retrying={bannerRetrying}
      lang={language}
    />
  )
}

function DashboardCharts() {
  const { pathname } = useLocation()
  const { charts, bannerRetrying, chromeError, language } = useConsole()
  if (incidentIdFromPath(pathname) !== null) return null
  return (
    <Charts
      charts={charts}
      loading={charts === null && chromeError === null}
      retrying={bannerRetrying}
      lang={language}
    />
  )
}

/** Temporary incidents content: the current queue, map, and incident, inside the console chrome. */
export function IncidentsPage() {
  const { queue, detail, loadError, activeId, select, actions } = useIncidents()
  const { language, charts } = useConsole()
  const crews = useMemo(() => crewDots(detail && detail.incident.id === activeId ? detail.volunteers : null), [detail, activeId])
  const wind = useMemo(() => windReading(charts?.windKmh, charts?.windDirDeg), [charts])
  const groups = useMemo(() => groupByArea(queue ?? []), [queue])
  return (
    <div className="sup">
      <div className="sup-main">
        <DashboardLiveBanner />
        <DashboardUpdated />
        <DashboardReignitionAlert />
        <DashboardSeasonImpact />
        <DashboardCharts />
        {loadError && <p className="sup-error" role="alert">{loadError}</p>}
        {queue === null ? (
          <div className="sup-state" role="status">
            <p className="sup-state-title">Loading live incident…</p>
            <p className="sup-muted">Reports, conflicts and tasks</p>
          </div>
        ) : queue.length === 0 ? (
          <>
            <IncidentQueue groups={[]} activeId={null} onSelect={select} lang={language} />
            <div className="sup-state">
              <p className="sup-label">Live incident</p>
              <p className="sup-state-title">No live incidents</p>
              <p className="sup-muted">When a volunteer reports a fire, the incident opens here with the reports and EMBER’s suggested tasks.</p>
            </div>
          </>
        ) : (
          <div className="sup-work">
            <IncidentQueue groups={groups} activeId={activeId} onSelect={select} lang={language} />
            <div className="sup-work-detail">
              <IncidentMap incidents={queue} selectedId={activeId} onSelect={select} showLayers crews={crews} wind={wind} lang={language} />
              {detail && detail.incident.id === activeId ? (
                <IncidentView key={detail.incident.id} detail={detail} actions={actions} lang={language} />
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

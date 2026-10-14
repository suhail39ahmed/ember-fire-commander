import { useCallback, useEffect, useMemo, useState } from 'react'

import { useAuth } from '../auth/AuthProvider'
import { authHeadersFor } from '../pwa/api/authHeaders'
import { USE_MOCK_API } from '../pwa/api/config'
import { ApiError } from '../pwa/api/types'
import { createHttpSupervisorApi } from './api/client'
import { createMockSupervisorApi } from './api/mock'
import type { SupervisorApi } from './api/types'
import type { Incident, IncidentDetail } from './contracts'
import { IncidentView, type Outcome } from './IncidentView'
import { SEVERITY_LABEL, sortQueue, STATUS_LABEL, volunteerName } from './view'
import './supervisor.css'

const POLL_MS = 5000

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'network') return 'Could not reach ember-api. Nothing was changed.'
    return e.message
  }
  return 'Something went wrong. Nothing was changed.'
}

/** Supervisor decision screen at /console. Rendered inside RequireRole role="supervisor". */
export function SupervisorConsole({ api: apiOverride }: { api?: SupervisorApi }) {
  const { user, me, signOut } = useAuth()
  const getAuthHeaders = useMemo(() => authHeadersFor(user), [user])
  const api = useMemo<SupervisorApi>(
    () => apiOverride ?? (USE_MOCK_API ? createMockSupervisorApi(me?.id ?? 'uid_mock') : createHttpSupervisorApi(getAuthHeaders)),
    [apiOverride, getAuthHeaders, me?.id],
  )
  const [queue, setQueue] = useState<Incident[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<IncidentDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({})

  const activeId = selectedId && queue?.some((i) => i.id === selectedId) ? selectedId : queue?.[0]?.id ?? null

  const load = useCallback(async () => {
    try {
      const incidents = sortQueue(await api.listIncidents())
      setQueue(incidents)
      setLoadError(null)
    } catch (e) {
      setLoadError(errorText(e))
    }
  }, [api])

  const loadDetail = useCallback(async (id: string | null) => {
    if (!id) {
      setDetail(null)
      return
    }
    try {
      setDetail(await api.getIncident(id))
    } catch (e) {
      setLoadError(errorText(e))
    }
  }, [api])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    void loadDetail(activeId)
  }, [activeId, queue, loadDetail])

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

  const actions = {
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
  }

  return (
    <div className="sup">
      <aside className="sup-side">
        <p className="sup-brand">EMBER</p>
        <nav aria-label="Console">
          <span className="sup-nav active">Live incident</span>
        </nav>
        {queue && queue.length > 0 && (
          <ul className="sup-queue" aria-label="Incident queue">
            {queue.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  className={`sup-queue-item${i.id === activeId ? ' active' : ''}`}
                  aria-current={i.id === activeId}
                  onClick={() => setSelectedId(i.id)}
                >
                  <span>{i.id}</span>
                  <span className="sup-queue-meta">
                    {i.withdraw?.active ? 'WITHDRAW · ' : ''}{STATUS_LABEL[i.status]} · {SEVERITY_LABEL[i.severity]} · {i.evidenceScore}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="sup-duty">
          <p className="sup-label">ON DUTY</p>
          <p>{me?.displayName || volunteerName(me?.id ?? '')} · Supervisor</p>
          {USE_MOCK_API && <p className="sup-muted">SIMULATED data</p>}
          <button type="button" className="sup-signout" onClick={() => { void signOut() }}>Sign out</button>
        </div>
      </aside>

      <main className="sup-main">
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
        ) : detail ? (
          <IncidentView key={detail.incident.id} detail={detail} actions={actions} />
        ) : (
          <div className="sup-state" role="status"><p className="sup-state-title">Loading live incident…</p></div>
        )}
      </main>
    </div>
  )
}

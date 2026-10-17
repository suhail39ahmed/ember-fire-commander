import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { t, type Lang } from '../pwa/i18n'
import { approvalsCopy } from './approvalsCopy'
import { approvalIncidentLabel, groupByIncident } from './approvalsModel'
import { useConsole } from './ConsoleProvider'
import type { PendingJoinRequest, ProposedTask } from './contracts'
import { ProposalRow } from './detail/ProposalRow'
import { OutcomeLine } from './IncidentView'
import { POLL_MS, useIncidents } from './incidentsContext'
import { JoinRequests } from './JoinRequests'
import { consoleIncidentPath } from './paths'
import './supervisor.css'

export interface ApprovalsViewProps {
  lang: Lang
  items: ProposedTask[] | null
  failed: boolean
  actions: ReturnType<typeof useIncidents>['actions']
  offline: boolean
  editor: string
  /** Volunteers asking to join a fire. Left out, the page has no such section. */
  joins?: PendingJoinRequest[]
  /** One line per answered request, which has left the list. */
  joinDone?: { id: string; text: string }[]
  onApproveJoin?: (id: string, instruction: string) => Promise<void>
  onDeclineJoin?: (id: string) => Promise<void>
}

/** Everything waiting for the supervisor, across all incidents, with the same controls as the incident page. */
export function ApprovalsView({ lang, items, failed, actions, offline, editor, joins = [], joinDone = [], onApproveJoin, onDeclineJoin }: ApprovalsViewProps) {
  const waiting = (items?.length ?? 0) + joins.length
  // A decided task leaves the list, and its row takes its confirmation along, so say it here.
  const decided = Object.entries(actions.outcomes).filter(
    ([id, o]) => (o.action === 'approve' || o.action === 'reject') && items !== null && !items.some((i) => i.task.id === id),
  )
  return (
    <div className="sup">
      <div className="sup-main">
        <h1 className="approvals-title">
          {t(lang, approvalsCopy.title)}
          {items && waiting > 0 && <span className="approvals-count"> · {waiting} {t(lang, approvalsCopy.waiting)}</span>}
        </h1>
        {decided.map(([id, outcome]) => <OutcomeLine key={id} outcome={outcome} lang={lang} />)}
        {joinDone.map((done) => <p key={done.id} className="sup-ok" role="status">{done.text}</p>)}
        {failed && <p className="sup-error" role="alert">{t(lang, approvalsCopy.failed)}</p>}
        {onApproveJoin && onDeclineJoin && (
          <JoinRequests lang={lang} items={joins} offline={offline} onApprove={onApproveJoin} onDecline={onDeclineJoin} />
        )}
        {items === null ? (
          !failed && <p className="sup-muted" role="status">{t(lang, approvalsCopy.loading)}</p>
        ) : items.length === 0 ? (
          joins.length === 0 &&
          <div className="sup-state" role="status">
            <p className="sup-state-title">{t(lang, approvalsCopy.emptyTitle)}</p>
            <p className="sup-muted">{t(lang, approvalsCopy.emptyBody)}</p>
          </div>
        ) : (
          groupByIncident(items).map((group) => {
            const first = group.items[0]
            const incident = first.incident
            return (
              <section key={group.key} className="approvals-group" aria-label={approvalIncidentLabel(first, lang)}>
                <h2 className="approvals-incident">
                  {incident ? (
                    <Link to={consoleIncidentPath(incident.id)}>{approvalIncidentLabel(first, lang)}</Link>
                  ) : (
                    approvalIncidentLabel(first, lang)
                  )}
                </h2>
                <ul className="prop-list">
                  {group.items.map((item) => (
                    <ProposalRow
                      key={item.task.id}
                      lang={lang}
                      task={item.task}
                      detail={{
                        incident: { id: item.task.incidentId, name: item.incident?.name ?? null, area: item.incident?.area ?? null },
                        conflict: null,
                        observations: [],
                        volunteers: [],
                      }}
                      volunteerName={item.volunteerName}
                      held={Boolean(item.incident?.conflictId) && item.incident?.status === 'held'}
                      actions={actions}
                      offline={offline}
                      editor={editor}
                    />
                  ))}
                </ul>
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}

/** Route element for `/console/approvals`. */
export function ApprovalsPage() {
  const { language, supervisor, reloadChrome } = useConsole()
  const { api, actions, connection } = useIncidents()
  const [items, setItems] = useState<ProposedTask[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [joins, setJoins] = useState<PendingJoinRequest[]>([])
  const [joinDone, setJoinDone] = useState<{ id: string; text: string }[]>([])

  const load = useCallback(async () => {
    try {
      // A join list that cannot be read (an older server) must not hide the proposals.
      const [tasks, requests] = await Promise.all([api.listProposedTasks(), api.listJoinRequests().catch(() => null)])
      setItems(tasks)
      if (requests) setJoins(requests)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [api])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  // A decision just finished: read the list again and refresh the count in the menu.
  const wasBusy = useRef(false)
  useEffect(() => {
    const busy = actions.busyId !== null
    if (wasBusy.current && !busy) {
      void load()
      void reloadChrome()
    }
    wasBusy.current = busy
  }, [actions.busyId, load, reloadChrome])

  const decideJoin = useCallback(async (id: string, who: string | null, send: () => Promise<{ auditId: string }>, done: 'joinApproved' | 'joinDeclined') => {
    try {
      const result = await send()
      const name = who?.trim() || t(language, approvalsCopy.volunteerFallback)
      const text = `${t(language, approvalsCopy[done])} · ${name} · ${t(language, approvalsCopy.joinAudit)} ${result.auditId}`
      setJoinDone((rows) => [{ id: `${id}:${result.auditId}`, text }, ...rows].slice(0, 5))
    } finally {
      // Also after a 409: the request was answered elsewhere, so the list must catch up.
      void load()
      void reloadChrome()
    }
  }, [language, load, reloadChrome])

  const nameOf = (id: string) => joins.find((j) => j.request.id === id)?.volunteerName ?? null

  return (
    <ApprovalsView
      joins={joins}
      joinDone={joinDone}
      onApproveJoin={(id, instruction) => decideJoin(id, nameOf(id), () => api.approveJoinRequest(id, instruction), 'joinApproved')}
      onDeclineJoin={(id) => decideJoin(id, nameOf(id), () => api.declineJoinRequest(id), 'joinDeclined')}
      lang={language}
      items={items}
      failed={failed}
      actions={actions}
      offline={connection.lost}
      editor={supervisor.displayName}
    />
  )
}

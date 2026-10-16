import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { t, type Lang } from '../pwa/i18n'
import { approvalsCopy } from './approvalsCopy'
import { approvalIncidentLabel, groupByIncident } from './approvalsModel'
import { useConsole } from './ConsoleProvider'
import type { ProposedTask } from './contracts'
import { ProposalRow } from './detail/ProposalRow'
import { OutcomeLine } from './IncidentView'
import { POLL_MS, useIncidents } from './incidentsContext'
import { consoleIncidentPath } from './paths'
import './supervisor.css'

export interface ApprovalsViewProps {
  lang: Lang
  items: ProposedTask[] | null
  failed: boolean
  actions: ReturnType<typeof useIncidents>['actions']
  offline: boolean
  editor: string
}

/** Everything waiting for the supervisor, across all incidents, with the same controls as the incident page. */
export function ApprovalsView({ lang, items, failed, actions, offline, editor }: ApprovalsViewProps) {
  // A decided task leaves the list, and its row takes its confirmation along, so say it here.
  const decided = Object.entries(actions.outcomes).filter(
    ([id, o]) => (o.action === 'approve' || o.action === 'reject') && items !== null && !items.some((i) => i.task.id === id),
  )
  return (
    <div className="sup">
      <div className="sup-main">
        <h1 className="approvals-title">
          {t(lang, approvalsCopy.title)}
          {items && items.length > 0 && <span className="approvals-count"> · {items.length} {t(lang, approvalsCopy.waiting)}</span>}
        </h1>
        {decided.map(([id, outcome]) => <OutcomeLine key={id} outcome={outcome} lang={lang} />)}
        {failed && <p className="sup-error" role="alert">{t(lang, approvalsCopy.failed)}</p>}
        {items === null ? (
          !failed && <p className="sup-muted" role="status">{t(lang, approvalsCopy.loading)}</p>
        ) : items.length === 0 ? (
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

  const load = useCallback(async () => {
    try {
      setItems(await api.listProposedTasks())
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

  return (
    <ApprovalsView
      lang={language}
      items={items}
      failed={failed}
      actions={actions}
      offline={connection.lost}
      editor={supervisor.displayName}
    />
  )
}

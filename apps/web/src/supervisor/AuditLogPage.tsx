import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { authHeadersFor } from '../pwa/api/authHeaders'
import { USE_MOCK_API } from '../pwa/api/config'
import { ApiError } from '../pwa/api/types'
import { formatDateTime } from '../pwa/formatTime'
import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { createHttpSupervisorApi } from './api/client'
import { createMockSupervisorApi } from './api/mock'
import type { AuditEntry, SupervisorApi } from './api/types'
import { auditCopy } from './auditCopy'
import { groupByDay } from './auditModel'
import { consoleIncidentPath } from './paths'
import './auditLog.css'

function errorText(e: unknown, lang: 'id' | 'en'): string {
  if (e instanceof ApiError && e.code === 'network') return t(lang, auditCopy.failed)
  if (e instanceof ApiError) return e.message
  return t(lang, auditCopy.failed)
}

function actionLabel(action: string): string {
  return action.toUpperCase()
}

export function AuditTable({
  items,
  onOpen,
}: {
  items: AuditEntry[]
  onOpen: (entry: AuditEntry) => void
}) {
  const { lang } = useLanguage()
  return (
    <table className="audit-table">
      <thead>
        <tr>
          <th scope="col">{t(lang, auditCopy.time)}</th>
          <th scope="col">{t(lang, auditCopy.actor)}</th>
          <th scope="col">{t(lang, auditCopy.action)}</th>
          <th scope="col">{t(lang, auditCopy.target)}</th>
          <th scope="col">{t(lang, auditCopy.detail)}</th>
        </tr>
      </thead>
      {groupByDay(items).map((group) => (
        <tbody key={group.day}>
          <tr className="audit-day">
            <th scope="rowgroup" colSpan={5}>{group.day || '—'}</th>
          </tr>
          {group.items.map((entry) => {
            const openable = Boolean(entry.incidentId)
            const withdraw = entry.action === 'task.withdraw'
            return (
              <tr
                key={entry.id}
                className={[withdraw ? 'audit-row-withdraw' : '', openable ? 'audit-row-open' : ''].filter(Boolean).join(' ')}
                onClick={openable ? () => onOpen(entry) : undefined}
                onKeyDown={openable ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpen(entry)
                  }
                } : undefined}
                tabIndex={openable ? 0 : undefined}
                role={openable ? 'link' : undefined}
              >
                <td className="audit-time"><time dateTime={entry.at}>{formatDateTime(entry.at)}</time></td>
                <td>{entry.actorName}</td>
                <td className={withdraw ? 'audit-action-withdraw' : 'audit-action'}>
                  <code>{actionLabel(entry.action)}</code>
                </td>
                <td>{entry.target}</td>
                <td className="audit-detail">{entry.detail}</td>
              </tr>
            )
          })}
        </tbody>
      ))}
    </table>
  )
}

/** Append-only supervisor log. Fills `/console/audit` (issue #99). */
export function AuditLogPage({ api: apiOverride }: { api?: SupervisorApi } = {}) {
  const { lang } = useLanguage()
  const { user, me } = useAuth()
  const navigate = useNavigate()
  const getAuthHeaders = useMemo(() => authHeadersFor(user), [user])
  const api = useMemo<SupervisorApi>(
    () => apiOverride ?? (USE_MOCK_API ? createMockSupervisorApi(me?.id ?? 'uid_mock', 'region') : createHttpSupervisorApi(getAuthHeaders)),
    [apiOverride, getAuthHeaders, me?.id],
  )

  const [items, setItems] = useState<AuditEntry[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async (cursor?: string | null) => {
    const appending = Boolean(cursor)
    if (appending) setLoadingMore(true)
    else setLoading(true)
    try {
      const page = await api.listAudit({ cursor: cursor ?? undefined })
      setItems((prev) => (appending && prev ? [...prev, ...page.items] : page.items))
      setNextCursor(page.nextCursor)
      setError(null)
    } catch (e) {
      setError(errorText(e, lang))
      if (!appending) setItems(null)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [api, lang])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="audit-page">
      <header className="audit-header">
        <h1>{t(lang, auditCopy.title)}</h1>
        <p className="audit-sub">{t(lang, auditCopy.sub)}</p>
      </header>
      {error ? (
        <p className="audit-error" role="alert">
          {error}{' '}
          <button type="button" className="audit-retry" onClick={() => { void load() }}>
            {t(lang, auditCopy.retry)}
          </button>
        </p>
      ) : null}
      {loading && !items ? (
        <p className="audit-status" role="status">{t(lang, auditCopy.loading)}</p>
      ) : null}
      {items && items.length === 0 ? (
        <p className="audit-empty">{t(lang, auditCopy.empty)}</p>
      ) : null}
      {items && items.length > 0 ? (
        <AuditTable
          items={items}
          onOpen={(entry) => {
            if (entry.incidentId) navigate(consoleIncidentPath(entry.incidentId))
          }}
        />
      ) : null}
      {nextCursor ? (
        <button
          type="button"
          className="audit-more"
          disabled={loadingMore}
          onClick={() => { void load(nextCursor) }}
        >
          {t(lang, auditCopy.loadMore)}
        </button>
      ) : null}
    </main>
  )
}

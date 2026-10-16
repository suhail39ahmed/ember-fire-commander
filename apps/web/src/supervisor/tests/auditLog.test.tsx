import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createLanguageStore } from '../../pwa/language'
import { LanguageProvider } from '../../pwa/LanguageProvider'
import { createMockSupervisorApi } from '../api/mock'
import { createHttpSupervisorApi, SUPERVISOR_ENDPOINTS } from '../api/client'

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'ready',
    user: null,
    me: { id: 'uid_maya', displayName: 'Bu Maya', role: 'supervisor' as const },
    message: null,
    signIn: async () => undefined,
    signOut: async () => undefined,
    refreshMe: async () => undefined,
  }),
}))

// AuditLogPage imports authHeadersFor → auth/firebase. CI has no Firebase key.
vi.mock('../../pwa/api/authHeaders', () => ({
  authHeadersFor: () => async () => ({ Authorization: 'Bearer test' }),
}))

import { AuditLogPage, AuditTable } from '../AuditLogPage'
import type { AuditEntry } from '../api/types'
import { groupByDay, newestFirst } from '../auditModel'
import { formatDateTime } from '../../pwa/formatTime'

function renderPage(lang: 'id' | 'en' = 'en') {
  const store = createLanguageStore({ storage: { getItem: () => lang, setItem: () => undefined }, root: { lang: '' } })
  return renderToStaticMarkup(
    <LanguageProvider store={store}>
      <StaticRouter location="/console/audit">
        <AuditLogPage api={createMockSupervisorApi('uid_maya', 'withdraw', 0)} />
      </StaticRouter>
    </LanguageProvider>,
  )
}

describe('audit log page', () => {
  it('renders the frame title and append-only note', () => {
    const html = renderPage()
    expect(html).toContain('Audit log')
    expect(html).toContain('Append-only')
    expect(html).toContain('Clients can read, never write')
  })

  it('follows the stored language on the shell', () => {
    expect(renderPage('id')).toContain('Log audit')
    expect(renderPage('id')).toContain('Hanya tambah')
  })
})

describe('GET /audit client and mock', () => {
  it('lists seeded withdraw rows newest first with AI actor and detail', async () => {
    const api = createMockSupervisorApi('uid_maya', 'withdraw', 0)
    const page = await api.listAudit()
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items[0].action).toBe('task.withdraw')
    expect(page.items[0].actorName).toBe('AI')
    expect(page.items[0].incidentId).toBe('inc_demo_01')
    expect(page.items.some((row) => row.action === 'observation.create')).toBe(true)
  })

  it('returns an empty page for the empty scenario', async () => {
    const api = createMockSupervisorApi('uid_maya', 'empty', 0)
    await expect(api.listAudit()).resolves.toEqual({ items: [], nextCursor: null })
  })

  it('calls GET /audit with query params', async () => {
    const urls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 })
    }) as unknown as typeof fetch
    const api = createHttpSupervisorApi(async () => ({ Authorization: 'Bearer t' }), 'https://api.example', fetchImpl)
    await expect(api.listAudit({ limit: 10, targetId: 'inc_1' })).resolves.toEqual({ items: [], nextCursor: null })
    expect(urls[0]).toContain(`${SUPERVISOR_ENDPOINTS.audit}?`)
    expect(urls[0]).toContain('limit=10')
    expect(urls[0]).toContain('targetId=inc_1')
  })
})

describe('audit log: dates, order and names', () => {
  const row = (id: string, at: string, over: Partial<AuditEntry> = {}): AuditEntry => ({
    id, at, actorId: 'uid_maya', actorName: 'Bu Maya', action: 'task.approve', targetId: 't1', target: 'verify · Pak Dedi', detail: 'Approved', incidentId: 'inc_1', ...over,
  })

  it('sorts newest first, with a stable order for rows of the same time', () => {
    const items = [row('a', '2026-10-15T05:00:00Z'), row('b', '2026-10-16T05:00:00Z'), row('c', '2026-10-16T05:00:00Z')]
    expect(newestFirst(items).map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })

  it('groups rows under their day, newest day first', () => {
    const items = [
      row('a', new Date(2026, 9, 15, 9, 0).toISOString()),
      row('b', new Date(2026, 9, 16, 18, 0).toISOString()),
      row('c', new Date(2026, 9, 16, 8, 0).toISOString()),
    ]
    const days = groupByDay(items)
    expect(days.map((d) => d.day)).toEqual(['16 Oct 2026', '15 Oct 2026'])
    expect(days[0].items.map((r) => r.id)).toEqual(['b', 'c'])
  })

  it('shows the full date, the time and the zone on every row, and the names the server sent', () => {
    const at = new Date(2026, 9, 16, 17, 7).toISOString()
    const store = createLanguageStore({ storage: { getItem: () => 'en', setItem: () => undefined }, root: { lang: '' } })
    const html = renderToStaticMarkup(
      <LanguageProvider store={store}>
        <AuditTable items={[row('a', at, { actorName: 'Bu Maya', target: 'Dumai, Riau · Pak Dedi · #2' })]} onOpen={() => undefined} />
      </LanguageProvider>,
    )
    expect(html).toContain(formatDateTime(at))
    expect(html).toMatch(/16 Oct 2026, 17:07 \S+/)
    expect(html).toMatch(/<th scope="rowgroup"[^>]*>16 Oct 2026<\/th>/)
    expect(html).toContain('Bu Maya')
    expect(html).toContain('Dumai, Riau · Pak Dedi · #2')
    expect(html).not.toMatch(/uid_|13sWG/)
  })
})

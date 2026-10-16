import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createLanguageStore } from '../../pwa/language'
import { LanguageProvider } from '../../pwa/LanguageProvider'
import { createMockSupervisorApi } from '../api/mock'
import { createHttpSupervisorApi, SUPERVISOR_ENDPOINTS } from '../api/client'
import { AuditLogPage } from '../AuditLogPage'

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

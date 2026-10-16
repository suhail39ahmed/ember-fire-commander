import { renderToStaticMarkup } from 'react-dom/server'
import { Route, Routes, StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createLanguageStore } from '../../pwa/language'
import { LanguageProvider } from '../../pwa/LanguageProvider'
import { formatTimeZone } from '../../pwa/formatTime'
import { ApiError } from '../../pwa/api/types'
import { ConsoleLayout } from '../ConsoleLayout'
import { useConsole } from '../ConsoleProvider'
import { fetchConsoleChrome, type ConsoleChrome } from '../chromeClient'
import { consoleMenu, incidentIdFromPath } from '../paths'

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'ready',
    user: null,
    me: { id: 'sup_1', displayName: 'Bu Maya', role: 'supervisor' as const },
    message: null,
    signIn: async () => undefined,
    signOut: async () => undefined,
    refreshMe: async () => undefined,
  }),
}))

const chrome: ConsoleChrome = {
  agency: 'BPBD Kepulauan Meranti',
  serverTime: '2026-10-16T07:46:00Z',
  approvalsCount: 3,
}

function EmptySlot() {
  return null
}

function Probe() {
  const ctx = useConsole()
  return <p>{`incidents content ${ctx.supervisor.displayName} ${ctx.supervisor.role} ${ctx.activeMenu} ${ctx.agency}`}</p>
}

function renderAt(path: string, lang: 'id' | 'en' = 'en', over: { chrome?: ConsoleChrome; chromeError?: 'failed' | 'network' } = { chrome }) {
  const store = createLanguageStore({ storage: { getItem: () => lang, setItem: () => undefined }, root: { lang: '' } })
  return renderToStaticMarkup(
    <LanguageProvider store={store}>
      <StaticRouter location={path}>
        <Routes>
          <Route path="/console" element={<ConsoleLayout chrome={over.chrome} chromeError={over.chromeError} />}>
            <Route index element={<Probe />} />
            <Route path="incidents/:incidentId" element={<p>incident detail content</p>} />
            <Route path="approvals" element={<EmptySlot />} />
            <Route path="map" element={<EmptySlot />} />
            <Route path="audit" element={<EmptySlot />} />
            <Route path="settings" element={<EmptySlot />} />
          </Route>
        </Routes>
      </StaticRouter>
    </LanguageProvider>,
  )
}

describe('console paths', () => {
  it('maps the chrome routes and the incident detail path', () => {
    expect(consoleMenu('/console')).toBe('incidents')
    expect(consoleMenu('/console/incidents/inc_1')).toBe('incidents')
    expect(consoleMenu('/console/approvals')).toBe('approvals')
    expect(consoleMenu('/console/map')).toBe('map')
    expect(consoleMenu('/console/audit')).toBe('audit')
    expect(consoleMenu('/console/settings')).toBe('settings')
    expect(consoleMenu('/pwa')).toBeNull()
    expect(incidentIdFromPath('/console/incidents/inc_1')).toBe('inc_1')
    expect(incidentIdFromPath('/console')).toBeNull()
  })
})

function anchor(html: string, href: string): string {
  const tag = (html.match(/<a\b[^>]*>/g) ?? []).find((item) => item.includes(`href="${href}"`))
  if (!tag) throw new Error(`no anchor for ${href}`)
  return tag
}

describe('console chrome', () => {
  it('shows the menu, profile, clock, and agency from one provider', () => {
    const html = renderAt('/console')
    expect(html).toContain('EMBER')
    expect(html).toContain('Supervisor Console')
    expect(html).toContain('Bu Maya · BPBD Kepulauan Meranti')
    expect(html).toContain('Approvals · 3')
    expect(html).toContain(formatTimeZone(chrome.serverTime))
    expect(html).toMatch(/date[tT]ime="2026-10-16T07:46:00Z"/)
    expect(html).toContain('On duty')
    expect(html).toContain('aria-label="Account"')
    expect(html).toContain('Sign out')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('>EN<')
    expect(html).toContain('incidents content Bu Maya supervisor incidents BPBD Kepulauan Meranti')
    const incidents = anchor(html, '/console')
    expect(incidents).toContain('class="console-nav active"')
    expect(incidents).toContain('aria-current="page"')
    // The language dropdown and the Dark / Light switch (#106) share the top bar.
    expect(html).toContain('class="lang-menu"')
    expect(html).toContain('class="theme-switch"')
  })

  it('highlights the menu item for the open slot and leaves the others empty', () => {
    const audit = renderAt('/console/audit')
    const auditLink = anchor(audit, '/console/audit')
    expect(auditLink).toContain('class="console-nav active"')
    expect(auditLink).toContain('aria-current="page"')
    expect(audit).not.toContain('incident detail content')
    expect(audit).not.toMatch(/<form|<input|<select|<textarea/)

    // Settings has nothing to change yet, so it is not in the menu.
    expect(audit).not.toContain('href="/console/settings"')
    expect(audit).toContain('href="/console/map"')
    expect(audit).toContain('href="/console/approvals"')

    const detail = renderAt('/console/incidents/inc_1')
    expect(detail).toContain('incident detail content')
    expect(anchor(detail, '/console')).toContain('aria-current="page"')
  })

  it('follows the language dropdown', () => {
    const html = renderAt('/console', 'id')
    expect(html).toContain('Konsol Supervisor')
    expect(html).toContain('Insiden')
    expect(html).toContain('Persetujuan · 3')
    expect(html).toContain('Sedang bertugas')
    expect(html).toContain('Keluar')
  })

  it('keeps the menu when the chrome read fails', () => {
    const html = renderAt('/console', 'en', { chromeError: 'failed' })
    expect(html).toContain('Could not load the clock or approvals count.')
    expect(html).toContain('href="/console"')
    expect(html).toContain('Incidents')
    expect(html).toContain('--:--')
    expect(html).not.toContain('BPBD')
    expect(html).not.toMatch(/HTTP|403|500/)
  })
})

describe('dashboard chrome client', () => {
  const headers = async () => ({ Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-check' })

  it('reads GET /dashboard with the identity headers', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(chrome), { status: 200 }))
    await expect(fetchConsoleChrome(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)).resolves.toEqual(chrome)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example/dashboard')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer id-token')
    expect((init.headers as Record<string, string>)['X-Firebase-AppCheck']).toBe('app-check')
  })

  it('rejects a body that is missing the chrome fields', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ agency: 'BPBD' }), { status: 200 })
    await expect(fetchConsoleChrome(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(ApiError)
  })
})

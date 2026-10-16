import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createLanguageStore } from '../../pwa/language'
import { LanguageProvider } from '../../pwa/LanguageProvider'
import { AuthShell } from '../../routes/AuthShell'
import { ConsoleLayout } from '../ConsoleLayout'
import type { ConsoleChrome } from '../chromeClient'

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'ready',
    user: null,
    me: { id: 'sup_1', displayName: 'Bu Maya', role: 'supervisor' as const },
    message: null,
    signIn: async () => undefined,
    signOut: async () => undefined,
  }),
}))

const chrome: ConsoleChrome = { agency: 'BPBD Kepulauan Meranti', serverTime: '2026-10-16T07:46:00Z', approvalsCount: 3 }

function render(node: React.ReactNode) {
  const store = createLanguageStore({ storage: { getItem: () => 'en', setItem: () => undefined }, root: { lang: '' } })
  return renderToStaticMarkup(<LanguageProvider store={store}>{node}</LanguageProvider>)
}

describe('language dropdown and theme switch placement', () => {
  const page = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/console" element={<ConsoleLayout chrome={chrome} />}>
            <Route index element={<p>dashboard</p>} />
            <Route path="incidents/:incidentId" element={<p>incident detail</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

  it('sits once in the console top bar, on the dashboard and on incident detail', () => {
    for (const html of [page('/console'), page('/console/incidents/inc_1')]) {
      const top = html.slice(html.indexOf('<header'), html.indexOf('</header>'))
      expect(top.match(/class="lang-menu"/g)).toHaveLength(1)
      expect(top.match(/class="theme-switch"/g)).toHaveLength(1)
      expect(html.match(/class="lang-menu"/g)).toHaveLength(1)
      expect(html).not.toContain('lang-toggle')
    }
  })

  it('keeps the pill order of the frame: clock, language, theme, on duty', () => {
    const html = page('/console')
    const at = (needle: string) => html.indexOf(needle)
    expect(at('console-clock')).toBeLessThan(at('lang-menu'))
    expect(at('lang-menu')).toBeLessThan(at('theme-switch'))
    expect(at('theme-switch')).toBeLessThan(at('console-duty'))
  })

  it('is the same control on the sign-in screen', () => {
    const html = render(<AuthShell audience="supervisor"><p>card</p></AuthShell>)
    expect(html.match(/class="lang-menu"/g)).toHaveLength(1)
    expect(html.match(/class="theme-switch"/g)).toHaveLength(1)
    expect(html).not.toContain('lang-toggle')
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createLanguageStore } from '../../pwa/language'
import { LanguageProvider } from '../../pwa/LanguageProvider'
import { copy } from '../copy'

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signed-out', me: null, user: null, message: null, signIn: async () => undefined, signOut: async () => undefined, refreshMe: async () => undefined }),
}))
vi.mock('../../auth/config', () => ({ fetchConfig: async () => ({ demoMode: false }) }))

import { SignInScreen } from '../SignInScreen'

function render(lang: 'id' | 'en') {
  const store = createLanguageStore({ storage: { getItem: () => lang, setItem: () => undefined }, root: { lang: '' } })
  return renderToStaticMarkup(
    <LanguageProvider store={store}>
      <StaticRouter location="/console">
        <SignInScreen audience="supervisor" />
      </StaticRouter>
    </LanguageProvider>,
  )
}

describe('supervisor sign-in copy', () => {
  it('says the tagline from the design, in English and Bahasa', () => {
    expect(render('en')).toContain('Every report matters. Verify alerts, coordinate help, and support volunteers. Withdrawal rules are enforced by code. EMBER only suggests; people decide.')
    expect(render('id')).toContain('Setiap laporan penting.')
    expect(render('id')).toContain('EMBER hanya menyarankan; manusia yang memutuskan.')
    expect(copy.tagline.supervisor.en).not.toContain('Many eyes')
  })

  it('labels the screen as the supervisor console and keeps the simulated-demo line to demo mode', () => {
    const html = render('en')
    expect(html).toContain('SUPERVISOR CONSOLE · BPBD')
    expect(copy.footnote.en).toBe('Simulated demo · no real volunteer data')
    expect(html).not.toContain('no real volunteer data')
  })
})

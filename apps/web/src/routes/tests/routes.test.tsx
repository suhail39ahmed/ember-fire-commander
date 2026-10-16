import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createLanguageStore } from '../../pwa/language'
import { LanguageProvider } from '../../pwa/LanguageProvider'
import { homeFor } from '../paths'

type Auth = {
  status: 'loading' | 'signed-out' | 'ready' | 'no-access' | 'error'
  me: { id: string; displayName: string; role: 'volunteer' | 'supervisor' } | null
  message: string | null
  user: { email: string | null } | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  refreshMe: () => Promise<void>
}

const state = vi.hoisted(() => ({ auth: null as unknown as Auth }))

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => state.auth }))
vi.mock('../../auth/config', () => ({
  fetchConfig: async () => ({ demoMode: false }),
}))
vi.mock('../../pwa/VolunteerApp', () => ({ VolunteerApp: () => <p>volunteer app screen</p> }))
vi.mock('../../supervisor/ConsoleLayout', () => ({ ConsoleLayout: () => <p>console screen</p> }))
vi.mock('../../supervisor/SupervisorConsole', () => ({
  IncidentsShell: () => null,
  IncidentsPage: () => <p>incidents content</p>,
}))

import { AppRoutes } from '../AppRoutes'

function signedOut(over: Partial<Auth> = {}): Auth {
  return {
    status: 'signed-out',
    me: null,
    message: null,
    user: null,
    signIn: async () => undefined,
    signOut: async () => undefined,
    refreshMe: async () => undefined,
    ...over,
  }
}
const volunteer = { id: 'vol_1', displayName: 'Pak Dedi', role: 'volunteer' as const }
const supervisor = { id: 'sup_1', displayName: 'Bu Maya', role: 'supervisor' as const }

function render(path: string, lang: 'id' | 'en' = 'en') {
  const store = createLanguageStore({ storage: { getItem: () => lang, setItem: () => undefined }, root: { lang: '' } })
  return renderToStaticMarkup(
    <LanguageProvider store={store}>
      <StaticRouter location={path}>
        <AppRoutes />
      </StaticRouter>
    </LanguageProvider>,
  )
}

/** Signed-in pages are lazy chunks: the first render shows the loading screen, the next one the page. */
async function renderSettled(path: string, lang: 'id' | 'en' = 'en') {
  render(path, lang)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return render(path, lang)
}

beforeEach(() => {
  state.auth = signedOut()
})

describe('homeFor', () => {
  it('sends each role to its own page', () => {
    expect(homeFor('volunteer')).toBe('/pwa')
    expect(homeFor('supervisor')).toBe('/console')
  })
})

describe('signed-out sign-in', () => {
  it('shows volunteer wording and branding at /pwa', () => {
    const html = render('/pwa')
    expect(html).toContain('Sign in to EMBER')
    expect(html).toContain('Volunteer app.')
    expect(html).toContain('VOLUNTEER APP')
    expect(html).not.toContain('Supervisor Console')
    expect(html).not.toContain('invited BPBD supervisors')
  })

  it('shows supervisor wording at /console', () => {
    const html = render('/console')
    expect(html).toContain('Sign in to the Supervisor Console')
    expect(html).toContain('invited BPBD supervisors')
    expect(html).not.toContain('Volunteer app.')
    expect(html).not.toContain('console screen')
    expect(html).not.toContain('On duty')
  })

  it('keeps console child routes on the sign-in screen', () => {
    const html = render('/console/audit')
    expect(html).toContain('Sign in to the Supervisor Console')
    expect(html).not.toContain('console screen')
    expect(html).not.toContain('On duty')
  })

  it('stays on the page that was opened instead of redirecting to /', () => {
    expect(render('/pwa')).not.toContain('Who are you signing in as?')
    expect(render('/console')).not.toContain('Who are you signing in as?')
  })

  it('follows the stored language', () => {
    expect(render('/pwa', 'id')).toContain('Masuk ke EMBER')
    expect(render('/pwa', 'id')).toContain('Masuk dengan Google')
    expect(render('/console', 'id')).toContain('Masuk ke Konsol Supervisor')
  })

  it('shows a sign-in error when there is one', () => {
    state.auth = signedOut({ message: 'Could not reach ember-api' })
    expect(render('/pwa')).toContain('Could not reach ember-api')
  })
})

describe('role choice at /', () => {
  it('offers both roles when signed out', () => {
    const html = render('/')
    expect(html).toContain('Who are you signing in as?')
    expect(html).toContain('href="/pwa"')
    expect(html).toContain('href="/console"')
    expect(html).toContain("I&#x27;m a volunteer")
    expect(html).toContain("I&#x27;m a supervisor")
  })

  it('follows the stored language', () => {
    expect(render('/', 'id')).toContain('Masuk sebagai siapa?')
  })

  it('waits while the account is being checked', () => {
    state.auth = signedOut({ status: 'loading' })
    const html = render('/')
    expect(html).toContain('Checking sign-in')
    expect(html).not.toContain('Who are you signing in as?')
  })
})

describe('signed-in pages', () => {
  it('shows the loading screen, not a blank page, on the first visit, while the page chunk downloads', () => {
    state.auth = signedOut({ status: 'ready', me: volunteer })
    const html = render('/pwa')
    expect(html).toContain('Checking sign-in')
    expect(html).not.toContain('volunteer app screen')
  })

  it('renders the volunteer app for a volunteer at /pwa', async () => {
    state.auth = signedOut({ status: 'ready', me: volunteer })
    expect(await renderSettled('/pwa')).toContain('volunteer app screen')
  })

  it('renders the console for a supervisor at /console', async () => {
    state.auth = signedOut({ status: 'ready', me: supervisor })
    expect(await renderSettled('/console')).toContain('console screen')
  })

  it('keeps later console routes inside the chrome', async () => {
    state.auth = signedOut({ status: 'ready', me: supervisor })
    for (const path of ['/console/approvals', '/console/map', '/console/audit', '/console/settings', '/console/incidents/inc_1']) {
      const html = await renderSettled(path)
      expect(html).toContain('console screen')
      expect(html).not.toContain('Page not found')
    }
  })

  it('tells a volunteer on /console the page is for supervisors, with a way to their own page', () => {
    state.auth = signedOut({
      status: 'ready',
      me: volunteer,
      user: { email: 'volunteer@example.com' },
    })
    const html = render('/console')
    expect(html).toContain('This page is for supervisors')
    expect(html).toContain('Account volunteer@example.com is registered as a volunteer')
    expect(html).toContain('403 · FORBIDDEN')
    expect(html).not.toContain('403 · FORBIDDEN · /CONSOLE')
    expect(html).toContain('href="/pwa"')
    expect(html).toContain('Sign out')
    expect(html).not.toContain('console screen')
    expect(html).not.toContain('On duty')
  })

  it('tells a volunteer on a console child route the page is for supervisors', () => {
    state.auth = signedOut({ status: 'ready', me: volunteer })
    const html = render('/console/settings')
    expect(html).toContain('This page is for supervisors')
    expect(html).not.toContain('console screen')
    expect(html).not.toContain('On duty')
  })

  it('tells a supervisor on /pwa the page is for volunteers', () => {
    state.auth = signedOut({ status: 'ready', me: supervisor })
    const html = render('/pwa')
    expect(html).toContain('This page is for volunteers')
    expect(html).toContain('href="/console"')
  })

  it('follows the stored language on the wrong-role page', () => {
    state.auth = signedOut({ status: 'ready', me: volunteer })
    expect(render('/console', 'id')).toContain('Halaman ini untuk supervisor')
  })

  it('shows the no-access screen with Check again when the account has no role', () => {
    state.auth = signedOut({
      status: 'no-access',
      message: 'No role assigned',
      user: { email: 'new@example.com' },
    })
    const html = render('/console')
    expect(html).toContain('You&#x27;re signed in, but not added yet')
    expect(html).toContain('Ask a BPBD admin to give new@example.com the supervisor role')
    expect(html).toContain('403 · ROLE_MISSING')
    expect(html).toContain('Check again')
    expect(html).toContain('Sign out')
  })

  it('shows a checking state instead of the sign-in while loading', () => {
    state.auth = signedOut({ status: 'loading' })
    const html = render('/pwa')
    expect(html).toContain('Checking sign-in')
    expect(html).not.toContain('Sign in with Google')
  })
})

describe('unknown paths', () => {
  it('leave an unknown console path outside the chrome', () => {
    state.auth = signedOut({ status: 'ready', me: supervisor })
    const html = render('/console/nope')
    expect(html).toContain('Page not found')
    expect(html).toContain("/console/nope doesn&#x27;t exist.")
    expect(html).toContain('404 · NOT FOUND')
    expect(html).not.toContain('console screen')
  })

  it('show a not-found page with the path and a way back', () => {
    const html = render('/nonexistent')
    expect(html).toContain('Page not found')
    expect(html).toContain("/nonexistent doesn&#x27;t exist.")
    expect(html).toContain('404 · NOT FOUND')
    expect(html).toContain('href="/pwa"')
    expect(html).toContain('Go to the volunteer app')
    expect(html).not.toContain('Sign in with Google')
  })

  it('send a signed-in supervisor back to the console', () => {
    state.auth = signedOut({ status: 'ready', me: supervisor })
    const html = render('/nope')
    expect(html).toContain('href="/console"')
    expect(html).toContain('Go to the console')
  })

  it('follow the stored language', () => {
    expect(render('/nonexistent', 'id')).toContain('Halaman tidak ditemukan')
  })
})

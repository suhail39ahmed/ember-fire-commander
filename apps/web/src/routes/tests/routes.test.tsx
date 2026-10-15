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
  user: null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const state = vi.hoisted(() => ({ auth: null as unknown as Auth }))

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => state.auth }))
vi.mock('../../pwa/VolunteerApp', () => ({ VolunteerApp: () => <p>volunteer app screen</p> }))
vi.mock('../../supervisor/SupervisorConsole', () => ({ SupervisorConsole: () => <p>console screen</p> }))

import { AppRoutes } from '../AppRoutes'

function signedOut(over: Partial<Auth> = {}): Auth {
  return { status: 'signed-out', me: null, message: null, user: null, signIn: async () => undefined, signOut: async () => undefined, ...over }
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
  it('renders the volunteer app for a volunteer at /pwa', () => {
    state.auth = signedOut({ status: 'ready', me: volunteer })
    expect(render('/pwa')).toContain('volunteer app screen')
  })

  it('renders the console for a supervisor at /console', () => {
    state.auth = signedOut({ status: 'ready', me: supervisor })
    expect(render('/console')).toContain('console screen')
  })

  it('tells a volunteer on /console the page is for supervisors, with a way to their own page', () => {
    state.auth = signedOut({ status: 'ready', me: volunteer })
    const html = render('/console')
    expect(html).toContain('This page is for supervisors')
    expect(html).toContain('403 · FORBIDDEN · /CONSOLE')
    expect(html).toContain('href="/pwa"')
    expect(html).toContain('Sign out')
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

  it('shows the server message when the account has no role', () => {
    state.auth = signedOut({ status: 'no-access', message: 'No role assigned' })
    const html = render('/pwa')
    expect(html).toContain('No access')
    expect(html).toContain('No role assigned')
  })

  it('shows a checking state instead of the sign-in while loading', () => {
    state.auth = signedOut({ status: 'loading' })
    const html = render('/pwa')
    expect(html).toContain('Checking sign-in')
    expect(html).not.toContain('Sign in with Google')
  })
})

describe('unknown paths', () => {
  it('show a not-found page with the path and a way back', () => {
    const html = render('/nonexistent')
    expect(html).toContain('Page not found')
    expect(html).toContain('404 · /nonexistent')
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

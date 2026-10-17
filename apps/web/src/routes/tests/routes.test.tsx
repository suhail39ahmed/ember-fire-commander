import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createLanguageStore } from '../../pwa/language'
import { LanguageProvider } from '../../pwa/LanguageProvider'
import { homeFor } from '../paths'

type Auth = {
  status: 'loading' | 'signed-out' | 'ready' | 'no-access' | 'error' | 'session-expired' | 'device-unverified'
  me: { id: string; displayName: string; role: 'volunteer' | 'supervisor'; onboardingComplete?: boolean } | null
  message: string | null
  user: { email: string | null } | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  refreshMe: (options?: { quiet?: boolean }) => Promise<void>
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
    expect(html).toContain('Spot a fire? Send a photo or voice report.')
    expect(html).toContain('VOLUNTEER APP')
    expect(html).not.toContain('Supervisor Console')
    expect(html).not.toContain('invited BPBD supervisors')
  })

  it('shows supervisor wording at /console', () => {
    const html = render('/console')
    expect(html).toContain('Sign in to the Supervisor Console')
    expect(html).toContain('invited BPBD supervisors')
    expect(html).not.toContain('Spot a fire?')
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
    expect(render('/pwa')).not.toContain('How will you help today?')
    expect(render('/console')).not.toContain('How will you help today?')
  })

  it('follows the stored language', () => {
    expect(render('/pwa', 'id')).toContain('Masuk ke EMBER')
    expect(render('/pwa', 'id')).toContain('Masuk dengan Google')
    expect(render('/console', 'id')).toContain('Masuk ke Konsol Supervisor')
  })

  it('shows a plain sentence when sign-in fails, never the raw message', () => {
    state.auth = signedOut({ message: 'Could not reach ember-api' })
    const html = render('/pwa')
    expect(html).toContain('We couldn&#x27;t sign you in')
    expect(html).not.toContain('Could not reach ember-api')
  })

  it('keeps the supervisor sign-in on the console card, not the volunteer photo screen', () => {
    const html = render('/console')
    expect(html).toContain('login-card')
    expect(html).not.toContain('vauth')
    expect(html).not.toContain('Create a volunteer account')
  })

  it('shows the signing-in frame, not a blank page, while /me is being checked', () => {
    state.auth = signedOut({ status: 'loading' })
    const html = render('/pwa')
    expect(html).toContain('Signing in…')
    expect(html).toMatch(/<button[^>]*disabled/)
  })
})

describe('role choice at /', () => {
  it('opens account setup directly from its registration URL while signed out', () => {
    const html = render('/pwa/create-account')
    expect(html).toContain('Join your village fire crew')
    expect(html).toContain('Sign up with Google')
    expect(html).not.toContain('class="vauth vauth-welcome"')
  })
  it('offers both roles when signed out', () => {
    const html = render('/')
    expect(html).toContain('How will you help today?')
    expect(html).toContain('href="/pwa"')
    expect(html).toContain('href="/console"')
    expect(html).toContain("I&#x27;m a volunteer")
    expect(html).toContain("I&#x27;m a supervisor")
  })

  it('follows the stored language', () => {
    expect(render('/', 'id')).toContain('Bagaimana Anda akan membantu hari ini?')
  })

  it('waits while the account is being checked', () => {
    state.auth = signedOut({ status: 'loading' })
    const html = render('/')
    expect(html).toContain('Checking sign-in')
    expect(html).not.toContain('How will you help today?')
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

  it('keeps the volunteer app behind account setup while the profile is incomplete', async () => {
    state.auth = signedOut({ status: 'ready', me: { ...volunteer, onboardingComplete: false } })
    const html = await renderSettled('/pwa/task/task_1')
    expect(html).toContain('Join your village fire crew')
    expect(html).toContain('name="displayName"')
    expect(html).toContain('name="phone"')
    expect(html).toContain('name="area"')
    expect(html).toContain('name="crewName"')
    expect(html).not.toContain('volunteer app screen')
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
    expect(html).toContain('Your account is registered as a volunteer. Open the volunteer app to report.')
    expect(html).toContain('403 · FORBIDDEN · /console')
    expect(html).toContain('Open the volunteer app')
    expect(html).toContain('Language')
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
    expect(html).toContain('403 · FORBIDDEN · /pwa')
    expect(html).toContain('href="/console"')
    expect(html).not.toContain('volunteer app screen')
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

  it('shows the volunteer no-access frame with the Firebase email', () => {
    state.auth = signedOut({
      status: 'no-access',
      message: 'No role assigned',
      user: { email: 'new@example.com' },
    })
    const html = render('/pwa')
    expect(html).toContain('You&#x27;re signed in, but not added yet')
    expect(html).toContain('Ask your BPBD supervisor to add new@example.com as a volunteer. Then tap Check again.')
    expect(html).toContain('403 · ROLE_MISSING')
    expect(html).toContain('Check again')
    expect(html).toContain('Sign out')
    expect(html).not.toContain('No role assigned')
  })

  it('shows a plain account-check failure to a volunteer, not the no-access frame', () => {
    state.auth = signedOut({ status: 'error', message: 'HTTP 500' })
    const html = render('/pwa')
    expect(html).toContain('We couldn&#x27;t check your account')
    expect(html).not.toContain('not added yet')
    expect(html).not.toContain('HTTP 500')
  })

  it('shows the session-expired frame, and not the app, after a 401', () => {
    state.auth = signedOut({ status: 'session-expired', user: { email: 'v@example.com' } })
    const html = render('/pwa/report')
    expect(html).toContain('Please sign in again')
    expect(html).toContain('Your session ended. Queued reports stay on this phone and send after you sign in.')
    expect(html).toContain('401 · UNAUTHORIZED')
    expect(html).toContain('Sign in with Google')
    expect(html).not.toContain('volunteer app screen')
  })

  it('shows the device-not-verified frame with Reload and Sign out', () => {
    state.auth = signedOut({ status: 'device-unverified', user: { email: 'v@example.com' } })
    const html = render('/pwa')
    expect(html).toContain('We couldn&#x27;t verify this device')
    expect(html).toContain('403 · APP CHECK')
    expect(html).toContain('Reload')
    expect(html).toContain('Sign out')
    expect(html).not.toContain('volunteer app screen')
  })

  it('follows the stored language on the session and device frames', () => {
    state.auth = signedOut({ status: 'session-expired', user: null })
    expect(render('/pwa', 'id')).toContain('Silakan masuk lagi')
    state.auth = signedOut({ status: 'device-unverified', user: null })
    expect(render('/pwa', 'id')).toContain('Muat ulang')
  })

  it('keeps a supervisor with an expired session on the console sign-in', () => {
    state.auth = signedOut({ status: 'session-expired' })
    const html = render('/console')
    expect(html).toContain('Sign in to the Supervisor Console')
    expect(html).not.toContain('vauth')
  })

  it('shows a checking state instead of the sign-in on the console while loading', () => {
    state.auth = signedOut({ status: 'loading' })
    const html = render('/console')
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
    expect(html).toContain('This link doesn&#x27;t go anywhere in EMBER.')
    expect(html).toContain('404 · /nonexistent')
    expect(html).toContain('href="/pwa"')
    expect(html).toContain('Go to the volunteer app')
    expect(html).not.toContain('Sign in with Google')
    expect(html).not.toContain('Error')
  })

  it('show the same volunteer page to a signed-in volunteer', () => {
    state.auth = signedOut({ status: 'ready', me: volunteer })
    const html = render('/nope')
    expect(html).toContain('404 · /nope')
    expect(html).toContain('href="/pwa"')
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

import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createLanguageStore } from '../../pwa/language'
import { LanguageProvider } from '../../pwa/LanguageProvider'
import { signInErrorText, volunteerSignInError } from '../copy'

const state = vi.hoisted(() => ({ status: 'signed-out' as string, message: null as string | null }))

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({
    status: state.status,
    me: null,
    user: null,
    message: state.message,
    signIn: async () => undefined,
    signOut: async () => undefined,
    refreshMe: async () => undefined,
  }),
}))

vi.mock('../../auth/config', () => ({
  fetchConfig: async () => ({ demoMode: false }),
}))

import { SignInScreen } from '../SignInScreen'

function render(lang: 'id' | 'en' = 'en') {
  const store = createLanguageStore({ storage: { getItem: () => lang, setItem: () => undefined }, root: { lang: '' } })
  return renderToStaticMarkup(
    <LanguageProvider store={store}>
      <StaticRouter location="/pwa">
        <SignInScreen audience="volunteer" />
      </StaticRouter>
    </LanguageProvider>,
  )
}

describe('sign-in button', () => {
  it('is enabled and idle by default', () => {
    state.status = 'signed-out'
    state.message = null
    const html = render()
    expect(html).toContain('Sign in with Google')
    expect(html).toContain('aria-busy="false"')
    expect(html).not.toContain('class="vauth-spinner"')
    expect(html).not.toMatch(/<button[^>]*disabled/)
  })

  it('offers account registration alongside Google sign-in and the language dropdown', () => {
    state.status = 'signed-out'
    state.message = null
    const html = render()
    expect(html).toContain('VOLUNTEER APP · RELAWAN')
    expect(html).toContain('Spot a fire? Send a photo or voice report. Your supervisor can coordinate help.')
    expect(html).toContain('NEW TO EMBER?')
    expect(html).toContain('Create a volunteer account')
    expect(html).toContain('href="/pwa/create-account"')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-label="Language: English"')
    expect(html).toContain('>EN</span>')
    expect(html).not.toContain('>ID</button>')
  })

  it('shows a spinner with the label while it works, and is disabled', () => {
    state.status = 'loading'
    state.message = null
    const html = render()
    expect(html).toContain('class="vauth-spinner"')
    expect(html).toContain('Signing in…')
    expect(html).toContain('Waiting for the Google window…')
    expect(html).toContain('aria-busy="true"')
    expect(html).toMatch(/<button[^>]*disabled/)
    expect(html).not.toContain('Create a volunteer account')
  })

  it('follows the stored language while loading', () => {
    state.status = 'loading'
    state.message = null
    const html = render('id')
    expect(html).toContain('Sedang masuk…')
    expect(html).toContain('Menunggu jendela Google…')
  })
})

describe('sign-in errors', () => {
  it('turns a closed pop-up into plain wording', () => {
    expect(signInErrorText('Firebase: Error (auth/popup-closed-by-user).', 'en')).toBe('Sign-in was cancelled. Try again.')
    expect(signInErrorText('Firebase: Error (auth/cancelled-popup-request).', 'id')).toBe('Masuk dibatalkan. Coba lagi.')
  })

  it('explains a blocked pop-up', () => {
    expect(signInErrorText('Firebase: Error (auth/popup-blocked).', 'en')).toContain('blocked the sign-in pop-up')
  })

  it('passes other messages through', () => {
    expect(signInErrorText('Could not reach ember-api', 'en')).toBe('Could not reach ember-api')
  })

  it('gives the volunteer a titled card for each failure', () => {
    expect(volunteerSignInError('Firebase: Error (auth/popup-blocked).', 'en')).toEqual({
      title: 'Sign-in window was blocked',
      body: 'Allow pop-ups for this site, then try again.',
    })
    expect(volunteerSignInError('Firebase: Error (auth/popup-closed-by-user).', 'en').title).toBe('Sign-in was cancelled')
    expect(volunteerSignInError('Firebase: Error (auth/network-request-failed).', 'en').title).toBe("We couldn't sign you in")
    expect(volunteerSignInError('Firebase: Error (auth/popup-blocked).', 'id').title).toBe('Jendela masuk diblokir')
  })

  it('shows the blocked card on screen, with Try again and no create-account section', () => {
    state.status = 'signed-out'
    state.message = 'Firebase: Error (auth/popup-blocked).'
    const html = render()
    expect(html).toContain('role="alert"')
    expect(html).toContain('Sign-in window was blocked')
    expect(html).toContain('Allow pop-ups for this site, then try again.')
    expect(html).toContain('>Try again</button>')
    expect(html).not.toContain('NEW TO EMBER?')
    expect(html).not.toContain('Create a volunteer account')
    expect(html).not.toContain('auth/popup-blocked')
  })

  it('shows the cancelled card when the window was closed', () => {
    state.status = 'signed-out'
    state.message = 'Firebase: Error (auth/popup-closed-by-user).'
    const html = render()
    expect(html).toContain('Sign-in was cancelled')
    expect(html).not.toContain('auth/popup-closed-by-user')
  })

  it('identifies an App Check rejection instead of suggesting a connection problem', () => {
    state.status = 'signed-out'
    state.message = 'AppCheck: Fetch server returned an HTTP error status. HTTP status: 403. (appCheck/fetch-status-error).'
    const html = render()
    expect(html).toContain('We couldn&#x27;t verify this device')
    expect(html).toContain('The security check failed.')
    expect(html).not.toContain('Check your connection')
    expect(html).not.toContain('appCheck/fetch-status-error')
    expect(volunteerSignInError(state.message, 'id').title).toBe('Kami tidak dapat memverifikasi perangkat ini')
  })

  it('never prints a raw failure message to the volunteer', () => {
    state.status = 'signed-out'
    state.message = 'HTTP 500'
    const html = render()
    expect(html).not.toContain('HTTP 500')
    expect(html).toContain('We couldn&#x27;t sign you in')
  })
})

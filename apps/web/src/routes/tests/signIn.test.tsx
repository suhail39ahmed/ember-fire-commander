import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createLanguageStore } from '../../pwa/language'
import { LanguageProvider } from '../../pwa/LanguageProvider'
import { signInErrorText } from '../copy'

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
    expect(html).not.toContain('class="spinner"')
    expect(html).not.toMatch(/<button[^>]*disabled/)
  })

  it('shows a spinner with the label while it works, and is disabled', () => {
    state.status = 'loading'
    const html = render()
    expect(html).toContain('class="spinner"')
    expect(html).toContain('Signing in…')
    expect(html).toContain('Opening Google…')
    expect(html).toContain('Waiting for the Google window…')
    expect(html).toContain('aria-busy="true"')
    expect(html).toMatch(/<button[^>]*disabled/)
  })

  it('follows the stored language while loading', () => {
    state.status = 'loading'
    const html = render('id')
    expect(html).toContain('Sedang masuk…')
    expect(html).toContain('Membuka Google…')
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

  it('shows the plain wording on screen', () => {
    state.status = 'signed-out'
    state.message = 'Firebase: Error (auth/popup-closed-by-user).'
    const html = render()
    expect(html).toContain('Sign-in was cancelled. Try again.')
    expect(html).not.toContain('auth/popup-closed-by-user')
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createLanguageStore } from '../../pwa/language'
import { LanguageProvider } from '../../pwa/LanguageProvider'

type TestAuth = {
  status: 'ready' | 'signed-out'
  user: { email: string; displayName: string } | null
  me: { id: string; displayName: string; role: 'volunteer' } | null
  signOut: () => Promise<void>
  signIn: () => Promise<void>
  refreshMe: () => Promise<void>
}

const state = vi.hoisted(() => ({ auth: null as unknown as TestAuth }))

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => state.auth }))
vi.mock('../../pwa/api/authHeaders', () => ({
  authHeadersFor: () => async () => ({ Authorization: 'Bearer test' }),
}))

import { VolunteerCreateAccountScreen } from '../VolunteerCreateAccountScreen'
import { isE164Phone, normalizeE164Phone } from '../accountValidation'

function render(lang: 'id' | 'en' = 'en') {
  const store = createLanguageStore({ storage: { getItem: () => lang, setItem: () => undefined }, root: { lang: '' } })
  return renderToStaticMarkup(
    <LanguageProvider store={store}>
      <StaticRouter location="/pwa/create-account">
        <VolunteerCreateAccountScreen />
      </StaticRouter>
    </LanguageProvider>,
  )
}

beforeEach(() => {
  state.auth = {
    status: 'ready',
    user: { email: 'dedi@example.com', displayName: 'Pak Dedi' },
    me: { id: 'vol_1', displayName: 'Pak Dedi', role: 'volunteer' },
    signOut: async () => undefined,
    signIn: async () => undefined,
    refreshMe: async () => undefined,
  }
})

describe('volunteer create-account screen', () => {
  it('opens the existing account page before Google registration and gates profile submission', () => {
    state.auth.status = 'signed-out'
    state.auth.user = null
    state.auth.me = null
    const html = render()
    expect(html).toContain('Join your village fire crew')
    expect(html).toContain('Sign up with Google')
    expect(html).toContain('class="create-account-fields" disabled=""')
    expect(html).toContain('aria-haspopup="menu"')
  })
  it('prefills Google identity and asks for the required profile details', () => {
    const html = render()
    expect(html).toContain('dedi@example.com')
    expect(html).toContain('value="Pak Dedi"')
    expect(html).toContain('name="phone"')
    expect(html).toContain('name="area"')
    expect(html).toContain('name="crewName"')
    expect(html).toContain('STEP 1 OF 2 · YOUR ACCOUNT')
    expect(html).toContain('Coach language')
    expect(html).toContain('aria-label="Language: English"')
    expect(html).not.toContain('aria-pressed=')
  })

  it('renders account copy in Bahasa', () => {
    expect(render('id')).toContain('Bergabung dengan regu pemadam desa')
  })
})

describe('E.164 phone validation', () => {
  it('normalizes common phone separators before validation', () => {
    expect(normalizeE164Phone(' +62 (812) 3456-7890 ')).toBe('+6281234567890')
    expect(isE164Phone(' +62 (812) 3456-7890 ')).toBe(true)
  })

  it.each(['081234567890', '+0123456789', '+123', '+1234567890123456', 'phone'])('rejects invalid number %s', (phone) => {
    expect(isE164Phone(phone)).toBe(false)
  })
})

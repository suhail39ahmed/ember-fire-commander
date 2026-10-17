import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createLanguageStore } from '../../pwa/language'
import { LanguageProvider } from '../../pwa/LanguageProvider'

const state = vi.hoisted(() => ({ auth: null as any }))

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => state.auth }))
vi.mock('../../pwa/api/authHeaders', () => ({
  authHeadersFor: () => async () => ({ Authorization: 'Bearer test' }),
}))

import { VolunteerCreateAccountScreen, isE164Phone, normalizeE164Phone } from '../VolunteerCreateAccountScreen'

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
    user: { email: 'dedi@example.com', displayName: 'Pak Dedi' },
    me: { id: 'vol_1', displayName: 'Pak Dedi', role: 'volunteer' },
    signOut: async () => undefined,
    refreshMe: async () => undefined,
  }
})

describe('volunteer create-account screen', () => {
  it('prefills Google identity and asks for the required profile details', () => {
    const html = render()
    expect(html).toContain('dedi@example.com')
    expect(html).toContain('value="Pak Dedi"')
    expect(html).toContain('name="phone"')
    expect(html).toContain('name="area"')
    expect(html).toContain('name="crewName"')
    expect(html).toContain('STEP 1 OF 2 · YOUR ACCOUNT')
    expect(html).toContain('Coach language')
    expect(html).toContain('>ID</button>')
    expect(html).toContain('>EN</button>')
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
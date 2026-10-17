import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createLanguageStore } from '../../pwa/language'
import { LanguageProvider } from '../../pwa/LanguageProvider'
import { LOGIN_PHOTO } from '../AuthShell'
import { copy } from '../copy'

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signed-out', me: null, user: null, message: null, signIn: async () => undefined, signOut: async () => undefined, refreshMe: async () => undefined }),
}))
vi.mock('../../auth/config', () => ({ fetchConfig: async () => ({ demoMode: false }) }))

import { SignInScreen } from '../SignInScreen'

function render(audience: 'supervisor' | 'volunteer', lang: 'id' | 'en' = 'en') {
  const store = createLanguageStore({ storage: { getItem: () => lang, setItem: () => undefined }, root: { lang: '' } })
  return renderToStaticMarkup(
    <LanguageProvider store={store}>
      <StaticRouter location={audience === 'supervisor' ? '/console' : '/pwa'}>
        <SignInScreen audience={audience} />
      </StaticRouter>
    </LanguageProvider>,
  )
}

describe('supervisor sign-in field photo', () => {
  it('fills the brand panel with the photo and describes it', () => {
    const html = render('supervisor')
    expect(html).toContain('class="login-brand has-photo"')
    expect(html).toContain(`<img class="login-photo" src="${LOGIN_PHOTO}" alt="Firefighters in orange uniforms spraying water on a smoky hillside"`)
  })

  it('describes it in Bahasa too', () => {
    expect(render('supervisor', 'id')).toContain(`alt="${copy.photoAlt.id}"`)
  })

  it('keeps the brand text in the panel, over the photo', () => {
    const html = render('supervisor')
    expect(html.indexOf('login-photo')).toBeLessThan(html.indexOf('SUPERVISOR CONSOLE · BPBD'))
    expect(html).toContain('Every report matters.')
  })

  it('leaves the volunteer sign-in on the plain panel', () => {
    const html = render('volunteer')
    expect(html).toContain('class="login-brand"')
    expect(html).not.toContain('login-photo')
  })

  it('ships the optimised file, under 300 KB', () => {
    const file = resolve(__dirname, '../../../public', LOGIN_PHOTO.slice(1))
    expect(existsSync(file)).toBe(true)
    expect(statSync(file).size).toBeLessThan(300 * 1024)
  })
})

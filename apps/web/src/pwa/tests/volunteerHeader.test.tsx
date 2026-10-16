import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { LANG_KEY } from '../i18n'
import { createLanguageStore } from '../language'
import { LanguageProvider } from '../LanguageProvider'
import { VolunteerHeader } from '../VolunteerHeader'

function render(lang: 'id' | 'en', name: string | null = 'Pak Dedi', crew: string | null = 'Regu Tohor') {
  const data = new Map([[LANG_KEY, lang]])
  const store = createLanguageStore({ storage: { getItem: (k) => data.get(k) ?? null, setItem: () => {} }, root: { lang: '' } })
  return renderToStaticMarkup(
    <LanguageProvider store={store}>
      <VolunteerHeader name={name} crew={crew} lang={lang} />
    </LanguageProvider>,
  )
}

describe('VolunteerHeader', () => {
  it('shows the volunteer name and the crew from the profile', () => {
    expect(render('en')).toContain('Pak Dedi')
    expect(render('en')).toContain('Regu Tohor')
    expect(render('id')).toContain('Regu Tohor')
  })

  it('says there is no crew yet instead of showing a made-up one', () => {
    expect(render('en', 'Pak Dedi', null)).toContain('No crew set yet')
    expect(render('id', 'Pak Dedi', '  ')).toContain('Regu belum diatur')
    expect(render('en', 'Pak Dedi', null)).not.toContain('Crew A')
  })

  it('keeps the name and the crew line in separate single-line elements', () => {
    const html = render('en')
    expect(html).toMatch(/<strong>Pak Dedi<\/strong>/)
    expect(html).toMatch(/<span class="vol-sub">Regu Tohor/)
  })

  it('falls back to EMBER when there is no name yet', () => {
    expect(render('id', null)).toContain('<strong>EMBER</strong>')
  })

  it('uses the shared ID | EN toggle and marks the current language', () => {
    const en = render('en')
    expect(en).toContain('class="lang-toggle"')
    expect(en).toMatch(/aria-pressed="true"[^>]*>EN</)
    expect(render('id')).toMatch(/aria-pressed="true"[^>]*>ID</)
  })

  it('does not carry the simulated badge, which would squeeze the toggle on a phone', () => {
    expect(render('en')).not.toContain('badge-simulated')
  })
})

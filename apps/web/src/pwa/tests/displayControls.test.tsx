import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { DisplayControls, LanguageDropdown, ThemeSwitch } from '../DisplayControls'
import { DEFAULT_LANG, LANGUAGES, LANG_KEY, parseLang, textLang, type LanguageCode } from '../i18n'
import { createLanguageStore } from '../language'
import { LanguageProvider } from '../LanguageProvider'
import { createThemeStore, DEFAULT_THEME, parseTheme, THEME_KEY } from '../theme'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  }
}

function withLang(node: React.ReactNode, lang: LanguageCode = 'en') {
  const store = createLanguageStore({ storage: memoryStorage({ [LANG_KEY]: lang }), root: { lang: '' } })
  return renderToStaticMarkup(<LanguageProvider store={store}>{node}</LanguageProvider>)
}

describe('theme store', () => {
  it('starts Light when nothing is stored', () => {
    const root = { dataset: {} as Record<string, string | undefined> }
    const store = createThemeStore({ storage: memoryStorage(), root })
    expect(store.get()).toBe('light')
    expect(root.dataset.theme).toBe('light')
    expect(DEFAULT_THEME).toBe('light')
  })

  it('starts from the saved theme', () => {
    const root = { dataset: {} as Record<string, string | undefined> }
    const store = createThemeStore({ storage: memoryStorage({ [THEME_KEY]: 'dark' }), root })
    expect(store.get()).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
  })

  it('ignores an unknown saved theme, with no error', () => {
    expect(parseTheme('sepia')).toBe('light')
    expect(parseTheme(null)).toBe('light')
    const store = createThemeStore({ storage: memoryStorage({ [THEME_KEY]: 'sepia' }) })
    expect(store.get()).toBe('light')
  })

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    const store = createThemeStore({ storage: broken })
    expect(store.get()).toBe('light')
    expect(() => store.set('dark')).not.toThrow()
    expect(store.get()).toBe('dark')
  })

  it('applies a change at once, saves it under its own key, and tells subscribers', () => {
    const storage = memoryStorage()
    const root = { dataset: {} as Record<string, string | undefined> }
    const store = createThemeStore({ storage, root })
    const listener = vi.fn()
    store.subscribe(listener)
    store.set('dark')
    expect(root.dataset.theme).toBe('dark')
    expect(storage.data.get(THEME_KEY)).toBe('dark')
    expect(storage.data.has(LANG_KEY)).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
    store.set('dark')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('survives a reload: a new store reads what the last one saved', () => {
    const storage = memoryStorage()
    createThemeStore({ storage }).set('dark')
    expect(createThemeStore({ storage }).get()).toBe('dark')
  })

  it('makes no network call', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const store = createThemeStore({ storage: memoryStorage() })
    store.set('dark')
    createLanguageStore({ storage: memoryStorage() }).set('en')
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('language registry', () => {
  it('offers Bahasa Indonesia and English plus three regional languages, with Bahasa the default', () => {
    expect(LANGUAGES.map((language) => language.code)).toEqual(['id', 'en', 'jv', 'su', 'ms'])
    expect(DEFAULT_LANG).toBe('id')
  })

  it('shows English copy for a language that has no translation yet', () => {
    expect(textLang('id')).toBe('id')
    expect(textLang('en')).toBe('en')
    for (const code of ['jv', 'su', 'ms'] as const) expect(textLang(code)).toBe('en')
  })

  it('keeps a chosen regional language and puts the copy language on the page', () => {
    const storage = memoryStorage()
    const root = { lang: '' }
    const store = createLanguageStore({ storage, root })
    store.set('jv')
    expect(store.get()).toBe('jv')
    expect(storage.data.get(LANG_KEY)).toBe('jv')
    expect(root.lang).toBe('en')
    expect(createLanguageStore({ storage, root: { lang: '' } }).get()).toBe('jv')
  })

  it('ignores an unknown saved language', () => {
    expect(parseLang('fr')).toBe('id')
    const store = createLanguageStore({ storage: memoryStorage({ [LANG_KEY]: 'fr' }), root: { lang: '' } })
    expect(store.get()).toBe('id')
  })
})

describe('language dropdown', () => {
  it('shows the current language and stays closed until opened', () => {
    const html = withLang(<LanguageDropdown />, 'en')
    expect(html).toContain('class="lang-menu-button"')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('>EN</span>')
    expect(html).not.toContain('role="menu"')
  })

  it('lists every language in the registry, with the current one checked', () => {
    const html = withLang(<LanguageDropdown defaultOpen />, 'id')
    expect(html).toContain('aria-expanded="true"')
    expect(html.match(/role="menuitemradio"/g)).toHaveLength(LANGUAGES.length)
    expect(html).toContain('Bahasa Indonesia')
    expect(html).toContain('English')
    expect(html).toMatch(/role="menuitemradio" aria-checked="true"[^>]*lang="id"/)
    expect(html).toMatch(/role="menuitemradio" aria-checked="false"[^>]*lang="en"/)
  })

  it('lists the regional languages and marks the chosen one', () => {
    const html = withLang(<LanguageDropdown defaultOpen />, 'jv')
    expect(html.match(/role="menuitemradio"/g)).toHaveLength(5)
    expect(html).toContain('Basa Jawa')
    expect(html).toContain('Basa Sunda')
    expect(html).toContain('Bahasa Melayu')
    expect(html).toMatch(/role="menuitemradio" aria-checked="true"[^>]*lang="jv"/)
    expect(html).toMatch(/role="menuitemradio" aria-checked="false"[^>]*lang="en"/)
  })

  it('shows the chosen language on the button and its name in English copy', () => {
    const html = withLang(<LanguageDropdown />, 'su')
    expect(html).toContain('aria-label="Language: Basa Sunda"')
    expect(html).toContain('>SU</span>')
  })

  it('can open upward, for a control at the bottom of a screen', () => {
    expect(withLang(<LanguageDropdown placement="up" />)).toContain('class="lang-menu lang-menu-up"')
    expect(withLang(<LanguageDropdown />)).toContain('class="lang-menu"')
  })

  it('names itself in the selected language', () => {
    expect(withLang(<LanguageDropdown />, 'id')).toContain('aria-label="Bahasa: Bahasa Indonesia"')
    expect(withLang(<LanguageDropdown />, 'en')).toContain('aria-label="Language: English"')
  })
})

describe('theme switch', () => {
  const store = (theme: 'light' | 'dark') => createThemeStore({ storage: memoryStorage({ [THEME_KEY]: theme }) })

  it('is a Dark / Light switch with the current one pressed', () => {
    const light = withLang(<ThemeSwitch store={store('light')} />)
    expect(light).toContain('role="group" aria-label="Theme"')
    expect(light.indexOf('Dark')).toBeLessThan(light.indexOf('Light'))
    expect(light).toMatch(/aria-pressed="false"[^>]*>(?:(?!<\/button>).)*Dark/)
    expect(light).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Light/)
    const dark = withLang(<ThemeSwitch store={store('dark')} />)
    expect(dark).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Dark/)
  })

  it('speaks Bahasa', () => {
    const html = withLang(<ThemeSwitch store={store('light')} />, 'id')
    expect(html).toContain('aria-label="Tema"')
    expect(html).toContain('Gelap')
    expect(html).toContain('Terang')
  })
})

describe('shared block', () => {
  it('is one language dropdown and one theme switch', () => {
    const html = withLang(<DisplayControls />)
    expect(html.match(/class="lang-menu"/g)).toHaveLength(1)
    expect(html.match(/class="theme-switch"/g)).toHaveLength(1)
  })
})

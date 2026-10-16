import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { DisplayControls, LanguageDropdown, ThemeSwitch } from '../DisplayControls'
import { DEFAULT_LANG, LANGUAGES, LANG_KEY, parseLang } from '../i18n'
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

function withLang(node: React.ReactNode, lang: 'id' | 'en' = 'en') {
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
  it('keeps Bahasa Indonesia and English, with Bahasa the default', () => {
    expect(LANGUAGES.map((language) => language.code)).toEqual(['id', 'en'])
    expect(DEFAULT_LANG).toBe('id')
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

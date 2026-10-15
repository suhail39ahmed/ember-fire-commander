import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_LANG, LANG_KEY, parseLang } from '../i18n'
import { createLanguageStore } from '../language'
import { LanguageProvider, LanguageToggle } from '../LanguageProvider'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  }
}

describe('parseLang', () => {
  it('accepts the two supported codes and falls back to the default', () => {
    expect(parseLang('en')).toBe('en')
    expect(parseLang('id')).toBe('id')
    expect(parseLang('fr')).toBe(DEFAULT_LANG)
    expect(parseLang(null)).toBe(DEFAULT_LANG)
    expect(parseLang(undefined)).toBe(DEFAULT_LANG)
  })

  it('keeps Bahasa Indonesia as the default', () => {
    expect(DEFAULT_LANG).toBe('id')
  })
})

describe('language store', () => {
  it('starts from the stored language and sets the page lang attribute', () => {
    const root = { lang: '' }
    const store = createLanguageStore({ storage: memoryStorage({ [LANG_KEY]: 'en' }), root })
    expect(store.get()).toBe('en')
    expect(root.lang).toBe('en')
  })

  it('uses the default when nothing is stored', () => {
    const root = { lang: 'xx' }
    const store = createLanguageStore({ storage: memoryStorage(), root })
    expect(store.get()).toBe('id')
    expect(root.lang).toBe('id')
  })

  it('updates the page lang attribute, storage and listeners when the language changes', () => {
    const storage = memoryStorage()
    const root = { lang: '' }
    const store = createLanguageStore({ storage, root })
    const listener = vi.fn()
    store.subscribe(listener)
    store.set('en')
    expect(store.get()).toBe('en')
    expect(root.lang).toBe('en')
    expect(storage.data.get(LANG_KEY)).toBe('en')
    expect(listener).toHaveBeenCalledTimes(1)
    store.set('id')
    expect(root.lang).toBe('id')
    expect(storage.data.get(LANG_KEY)).toBe('id')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('does not notify when the language is unchanged, and stops after unsubscribe', () => {
    const store = createLanguageStore({ storage: memoryStorage(), root: { lang: '' } })
    const listener = vi.fn()
    const off = store.subscribe(listener)
    store.set('id')
    expect(listener).not.toHaveBeenCalled()
    off()
    store.set('en')
    expect(listener).not.toHaveBeenCalled()
  })

  it('still switches when storage throws', () => {
    const root = { lang: '' }
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const store = createLanguageStore({ storage, root })
    expect(store.get()).toBe('id')
    store.set('en')
    expect(store.get()).toBe('en')
    expect(root.lang).toBe('en')
  })
})

describe('language toggle', () => {
  const render = (initial: 'id' | 'en') => {
    const store = createLanguageStore({ storage: memoryStorage({ [LANG_KEY]: initial }), root: { lang: '' } })
    return renderToStaticMarkup(
      <LanguageProvider store={store}>
        <LanguageToggle />
      </LanguageProvider>,
    )
  }

  it('marks the current language as pressed', () => {
    const en = render('en')
    expect(en).toMatch(/aria-pressed="true"[^>]*>EN</)
    expect(en).toMatch(/aria-pressed="false"[^>]*>ID</)
    const id = render('id')
    expect(id).toMatch(/aria-pressed="true"[^>]*>ID</)
  })

  it('labels the group in the current language', () => {
    expect(render('en')).toContain('aria-label="Language"')
    expect(render('id')).toContain('aria-label="Bahasa"')
  })
})

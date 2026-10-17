import { createContext, useContext } from 'react'

import { DEFAULT_LANG, LANG_KEY, parseLang, textLang, type Lang, type LanguageCode } from './i18n'

/** The pieces of the browser the language store touches, injectable for tests. */
export interface LanguageEnv {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  root?: { lang: string } | null
}

export interface LanguageStore {
  /** The language the volunteer chose. Use `textLang` for the copy language it shows. */
  get: () => LanguageCode
  set: (language: LanguageCode) => void
  subscribe: (listener: () => void) => () => void
}

/**
 * Holds the UI language. The choice is stored on the device and mirrored onto
 * the page's `lang` attribute, so browsers and screen readers follow the toggle.
 */
export function createLanguageStore({ storage = null, root = null }: LanguageEnv = {}): LanguageStore {
  const listeners = new Set<() => void>()
  let current: LanguageCode = DEFAULT_LANG
  try {
    current = parseLang(storage?.getItem(LANG_KEY))
  } catch {
    current = DEFAULT_LANG
  }
  // The page `lang` names the language the text is written in, which is English for a language without copy yet.
  if (root) root.lang = textLang(current)

  return {
    get: () => current,
    set: (next) => {
      if (next === current) return
      current = next
      try {
        storage?.setItem(LANG_KEY, next)
      } catch {
        // Storage can be unavailable (private mode); the choice then lasts for this visit only.
      }
      if (root) root.lang = textLang(next)
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

let appStore: LanguageStore | null = null

/** The store for the running app, created on first use. */
export function getAppLanguageStore(): LanguageStore {
  if (!appStore) {
    const hasDom = typeof document !== 'undefined'
    let storage: LanguageEnv['storage'] = null
    try {
      storage = typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      storage = null
    }
    appStore = createLanguageStore({ storage, root: hasDom ? document.documentElement : null })
  }
  return appStore
}

export interface LanguageValue {
  /** The language the screen's copy is written in. Pass it to `t()`. */
  lang: Lang
  /** The language the volunteer chose. Equals `lang` unless that language has no copy yet. */
  language: LanguageCode
  setLang: (language: LanguageCode) => void
}

export const LanguageContext = createContext<LanguageValue | null>(null)

export function useLanguage(): LanguageValue {
  const value = useContext(LanguageContext)
  if (!value) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return value
}

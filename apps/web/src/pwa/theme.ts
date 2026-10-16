import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

export const THEMES: readonly Theme[] = ['light', 'dark']
export const THEME_KEY = 'ember.theme'
export const DEFAULT_THEME: Theme = 'light'

/** Reads a stored theme; anything unknown falls back to the default. */
export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.find((theme) => theme === value) ?? DEFAULT_THEME
}

/** The pieces of the browser the theme store touches, injectable for tests. */
export interface ThemeEnv {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  root?: { dataset: Record<string, string | undefined> } | null
}

export interface ThemeStore {
  get: () => Theme
  set: (theme: Theme) => void
  subscribe: (listener: () => void) => () => void
}

/**
 * Holds the console theme. The choice is kept in this browser only (never sent to the API)
 * and mirrored onto `data-theme` on the page root, which the console styles follow.
 */
export function createThemeStore({ storage = null, root = null }: ThemeEnv = {}): ThemeStore {
  const listeners = new Set<() => void>()
  let current: Theme = DEFAULT_THEME
  try {
    current = parseTheme(storage?.getItem(THEME_KEY))
  } catch {
    current = DEFAULT_THEME
  }
  if (root) root.dataset.theme = current

  return {
    get: () => current,
    set: (next) => {
      if (next === current) return
      current = next
      try {
        storage?.setItem(THEME_KEY, next)
      } catch {
        // Storage can be unavailable (private mode); the choice then lasts for this visit only.
      }
      if (root) root.dataset.theme = next
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

let appStore: ThemeStore | null = null

/** The store for the running app, created on first use. Call it once at start-up so the theme is set before the first paint. */
export function getAppThemeStore(): ThemeStore {
  if (!appStore) {
    let storage: ThemeEnv['storage'] = null
    try {
      storage = typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      storage = null
    }
    appStore = createThemeStore({ storage, root: typeof document === 'undefined' ? null : document.documentElement })
  }
  return appStore
}

export function useTheme(store: ThemeStore = getAppThemeStore()): { theme: Theme; setTheme: (theme: Theme) => void } {
  const theme = useSyncExternalStore(store.subscribe, store.get, store.get)
  return { theme, setTheme: store.set }
}

import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

const RELOAD_KEY = 'ember.chunk-reload'
const RELOAD_WINDOW_MS = 30_000

interface ReloadStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * A page chunk can fail to load right after a deploy: the open tab still points at
 * hashed files the new build replaced. One reload fetches the fresh index.html and
 * the new chunk names. Returns true when it started that reload, false when it
 * already reloaded a moment ago (so a real outage cannot loop) or storage is unusable.
 */
export function reloadOnceForChunk(storage: ReloadStorage, reload: () => void, now: number): boolean {
  try {
    const last = Number(storage.getItem(RELOAD_KEY) ?? '0')
    if (Number.isFinite(last) && now - last < RELOAD_WINDOW_MS) {
      return false
    }
    storage.setItem(RELOAD_KEY, String(now))
  } catch {
    return false
  }
  reload()
  return true
}

/** React.lazy for a route page: loads on first render and recovers once from a stale chunk. */
export function lazyPage<P extends object>(load: () => Promise<ComponentType<P>>): LazyExoticComponent<ComponentType<P>> {
  return lazy(async () => {
    try {
      return { default: await load() }
    } catch (error) {
      if (typeof window !== 'undefined' && reloadOnceForChunk(window.sessionStorage, () => window.location.reload(), Date.now())) {
        // The page is reloading: keep the loading screen up instead of flashing an error.
        return new Promise<never>(() => undefined)
      }
      throw error
    }
  })
}

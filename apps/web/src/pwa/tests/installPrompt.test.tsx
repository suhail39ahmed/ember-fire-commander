import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { InstallBanner } from '../install/InstallBanner'
import {
  createInstallPromptStore,
  DISMISS_KEY,
  DISMISS_MS,
  dismissInstall,
  isDismissed,
  isIosDevice,
  isStandalone,
  type BeforeInstallPromptEvent,
} from '../install/installPrompt'

function fakeTarget() {
  const handlers = new Map<string, Array<(e: Event) => void>>()
  return {
    addEventListener: (type: string, fn: (e: Event) => void) => handlers.set(type, [...(handlers.get(type) ?? []), fn]),
    removeEventListener: (type: string, fn: (e: Event) => void) => handlers.set(type, (handlers.get(type) ?? []).filter((h) => h !== fn)),
    fire: (type: string, event: Partial<BeforeInstallPromptEvent> = {}) => (handlers.get(type) ?? []).forEach((h) => h(event as Event)),
    count: (type: string) => (handlers.get(type) ?? []).length,
  }
}

function offerEvent() {
  return { preventDefault: vi.fn(), prompt: vi.fn(async () => undefined) }
}

function memory() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data }
}

describe('install prompt capture', () => {
  it('keeps the browser offer made before any screen exists, and stops the browser from showing its own bar', () => {
    const target = fakeTarget()
    const store = createInstallPromptStore(target, false)
    const offer = offerEvent()
    target.fire('beforeinstallprompt', offer)
    expect(offer.preventDefault).toHaveBeenCalled()
    expect(store.getSnapshot().offer).toBe(offer)
  })

  it('tells subscribers when the offer arrives and when it is used', async () => {
    const target = fakeTarget()
    const store = createInstallPromptStore(target, false)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    const offer = offerEvent()
    target.fire('beforeinstallprompt', offer)
    expect(listener).toHaveBeenCalledTimes(1)
    await store.install()
    expect(offer.prompt).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().offer).toBeNull()
    unsubscribe()
    target.fire('appinstalled')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('does nothing when installing with no offer, and survives a dialog that cannot open', async () => {
    const target = fakeTarget()
    const store = createInstallPromptStore(target, false)
    await expect(store.install()).resolves.toBeUndefined()
    target.fire('beforeinstallprompt', { ...offerEvent(), prompt: async () => { throw new Error('blocked') } })
    await expect(store.install()).resolves.toBeUndefined()
  })

  it('is installed from the start when the app runs standalone, and after appinstalled', () => {
    expect(createInstallPromptStore(fakeTarget(), true).getSnapshot().installed).toBe(true)
    const target = fakeTarget()
    const store = createInstallPromptStore(target, false)
    target.fire('beforeinstallprompt', offerEvent())
    target.fire('appinstalled')
    expect(store.getSnapshot()).toEqual({ offer: null, installed: true })
  })

  it('stops listening on stop', () => {
    const target = fakeTarget()
    createInstallPromptStore(target, false).stop()
    expect(target.count('beforeinstallprompt')).toBe(0)
    expect(target.count('appinstalled')).toBe(0)
  })
})

describe('dismissal', () => {
  const NOW = new Date('2026-10-16T08:00:00.000Z')

  it('hides the banner for 7 days and then lets it return', () => {
    const store = memory()
    expect(isDismissed(NOW, store)).toBe(false)
    dismissInstall(NOW, store)
    expect(isDismissed(new Date(NOW.getTime() + DISMISS_MS - 1), store)).toBe(true)
    expect(isDismissed(new Date(NOW.getTime() + DISMISS_MS), store)).toBe(false)
  })

  it('ignores damaged values and missing storage', () => {
    const store = memory()
    store.setItem(DISMISS_KEY, 'yesterday-ish')
    expect(isDismissed(NOW, store)).toBe(false)
    expect(isDismissed(NOW, null)).toBe(false)
    expect(() => dismissInstall(NOW, null)).not.toThrow()
  })
})

describe('device detection', () => {
  it('recognises iPhone, iPod and iPad', () => {
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(true)
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)' })).toBe(true)
  })

  it('recognises an iPad that reports itself as a Mac, but not a real Mac', () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
    expect(isIosDevice({ userAgent: mac, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
    expect(isIosDevice({ userAgent: mac, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
  })

  it('does not treat Android or Windows as iOS', () => {
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', platform: 'Linux armv81', maxTouchPoints: 5 })).toBe(false)
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 0 })).toBe(false)
  })

  it('reads standalone from display-mode or the iOS flag', () => {
    const win = (matches: boolean, standalone?: boolean) =>
      ({ matchMedia: () => ({ matches }), navigator: { standalone } }) as unknown as Parameters<typeof isStandalone>[0]
    expect(isStandalone(win(true))).toBe(true)
    expect(isStandalone(win(false, true))).toBe(true)
    expect(isStandalone(win(false))).toBe(false)
  })
})

describe('InstallBanner', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows nothing in a browser that offers nothing and is not iOS', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux', maxTouchPoints: 5 })
    expect(renderToStaticMarkup(<InstallBanner lang="id" />)).toBe('')
  })

  it('shows the iPhone steps with a Not now button on iPad', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })
    const html = renderToStaticMarkup(<InstallBanner lang="en" />)
    expect(html).toContain('Add to Home Screen')
    expect(html).toContain('Not now')
  })

  it('hides the iOS steps while a Not now is in force', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone)', platform: 'iPhone', maxTouchPoints: 5 })
    // A moment ago, fixed up front: a clock read inside getItem can land after `now` and look like the future.
    const dismissedAt = new Date(Date.now() - 1000).toISOString()
    vi.stubGlobal('localStorage', { getItem: () => dismissedAt, setItem: () => undefined })
    expect(renderToStaticMarkup(<InstallBanner lang="id" />)).toBe('')
  })
})

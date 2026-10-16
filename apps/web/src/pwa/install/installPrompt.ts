/**
 * The browser's install offer (`beforeinstallprompt`), captured when the app starts.
 * The event fires once, early. The volunteer screen mounts later (lazy chunk, behind sign-in), so a listener added
 * there would miss it. This module has no React in it and keeps the event until the banner asks for it.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
}

export const DISMISS_KEY = 'ember.install.dismissedAt'
/** How long "Not now" hides the banner. */
export const DISMISS_MS = 7 * 24 * 60 * 60 * 1000

type Listener = () => void
type Store = Pick<Storage, 'getItem' | 'setItem'>

export interface InstallState {
  /** The event to call `prompt()` on, or null when the browser has offered nothing (or it was used). */
  offer: BeforeInstallPromptEvent | null
  installed: boolean
}

export interface InstallPromptStore {
  getSnapshot: () => InstallState
  subscribe: (listener: Listener) => () => void
  /** Use the offer: shows the browser's install dialog and forgets the event, which cannot be used twice. */
  install: () => Promise<void>
  stop: () => void
}

/** Start listening on `target`. Call once at boot; the returned store is what the banner reads. */
export function createInstallPromptStore(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, standalone: boolean): InstallPromptStore {
  let state: InstallState = { offer: null, installed: standalone }
  const listeners = new Set<Listener>()
  const set = (next: InstallState) => {
    state = next
    listeners.forEach((listener) => listener())
  }
  const onPrompt = (event: Event) => {
    event.preventDefault()
    set({ ...state, offer: event as BeforeInstallPromptEvent })
  }
  const onInstalled = () => set({ offer: null, installed: true })
  target.addEventListener('beforeinstallprompt', onPrompt)
  target.addEventListener('appinstalled', onInstalled)
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    install: async () => {
      const offer = state.offer
      if (!offer) return
      set({ ...state, offer: null })
      try {
        await offer.prompt()
      } catch {
        // The dialog could not be shown; the browser will offer again on a later visit.
      }
    },
    stop: () => {
      target.removeEventListener('beforeinstallprompt', onPrompt)
      target.removeEventListener('appinstalled', onInstalled)
    },
  }
}

export function isStandalone(win: Pick<Window, 'matchMedia'> & { navigator: Navigator }): boolean {
  return (
    win.matchMedia?.('(display-mode: standalone)').matches === true ||
    (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPhone, iPod and iPad. iPadOS reports itself as a Mac, so a Mac with a touch screen counts as an iPad. */
export function isIosDevice(nav: { userAgent: string; platform?: string; maxTouchPoints?: number }): boolean {
  if (/iphone|ipad|ipod/i.test(nav.userAgent)) return true
  return /^mac/i.test(nav.platform ?? '') && (nav.maxTouchPoints ?? 0) > 1
}

/** True while a "Not now" from the last 7 days is still in force. */
export function isDismissed(now: Date = new Date(), store: Pick<Store, 'getItem'> | null = defaultStore()): boolean {
  try {
    const at = Date.parse(store?.getItem(DISMISS_KEY) ?? '')
    return Number.isFinite(at) && at <= now.getTime() && now.getTime() - at < DISMISS_MS
  } catch {
    return false
  }
}

export function dismissInstall(now: Date = new Date(), store: Pick<Store, 'setItem'> | null = defaultStore()): void {
  try {
    store?.setItem(DISMISS_KEY, now.toISOString())
  } catch {
    // Storage can be unavailable (private mode); the banner then returns on the next visit.
  }
}

function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

let appStore: InstallPromptStore | null = null

/** Start capturing for the running app. Safe to call more than once. */
export function startInstallCapture(): InstallPromptStore | null {
  if (typeof window === 'undefined') return null
  appStore ??= createInstallPromptStore(window, isStandalone(window))
  return appStore
}

export function getInstallPromptStore(): InstallPromptStore | null {
  return appStore ?? startInstallCapture()
}

import { assetPathsFrom, CACHE_ASSETS_MESSAGE } from './shellAssets'

/** Later chunks (for example push messaging) load after sign-in; they are sent again this long after the first send. */
const RESEND_MS = 8000

/** Hands the worker the built files this page loaded, so an offline launch finds them in the cache. */
function sendLoadedAssets(registration: ServiceWorkerRegistration): void {
  const urls = assetPathsFrom(performance.getEntriesByType('resource'), window.location.origin)
  if (urls.length > 0) registration.active?.postMessage({ type: CACHE_ASSETS_MESSAGE, urls })
}

/**
 * Registers the app-shell service worker (public/sw.js) and keeps it informed of the files the page used.
 * Skipped in dev. Returns a function that cancels the pending resend.
 */
export function registerServiceWorker(): () => void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancelled = false
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then(() => navigator.serviceWorker.ready)
    .then((registration) => {
      if (cancelled) return
      sendLoadedAssets(registration)
      timer = setTimeout(() => sendLoadedAssets(registration), RESEND_MS)
    })
    .catch(() => {
      // the app still works without the service worker
    })
  return () => {
    cancelled = true
    if (timer !== undefined) clearTimeout(timer)
  }
}

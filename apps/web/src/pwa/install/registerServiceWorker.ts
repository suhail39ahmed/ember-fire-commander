/** Registers the app-shell service worker (public/sw.js). Skipped in dev. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
    // the app still works without the service worker
  })
}

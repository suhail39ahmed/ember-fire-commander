/* EMBER app-shell service worker.
 * - Caches the shell (HTML, built assets, icons) so the installed app launches.
 * - NEVER caches API or gateway traffic: only same-origin GET requests are handled,
 *   and ember-api / voice-gateway are different origins (Cloud Run).
 * - Offline report replay runs in the page (src/pwa/outbox/), not in this worker.
 * - Shows background pushes sent by ember-api through FCM and opens the volunteer
 *   screen when one is tapped (registration lives in src/pwa/push/).
 */
const CACHE = 'ember-shell-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/brand/ember-emblem.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Navigations: network first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')))
    return
  }
  // Static assets: cache first, then network (and remember hashed assets).
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && url.pathname.startsWith('/assets/')) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})

// Pushes ---------------------------------------------------------------------
// FCM delivers { notification: { title, body }, data: { taskId, incidentId, type } }.
// A data-only payload is shown too, so a push is never dropped silently.
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }
  const note = payload.notification || {}
  const data = payload.data || {}
  const withdraw = data.type === 'withdraw'
  event.waitUntil(
    self.registration.showNotification(note.title || data.title || 'EMBER', {
      body: note.body || data.body || '',
      icon: '/icons/icon-192.png',
      tag: data.taskId || undefined,
      data,
      requireInteraction: withdraw,
      vibrate: withdraw ? [400, 200, 400, 200, 400] : undefined,
    }),
  )
})

// A tap opens the volunteer screen. A WITHDRAW task shows the WITHDRAW screen
// there as soon as the digest loads, so an open page is told to refresh now.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const target = data.type === 'withdraw' ? '/pwa?push=withdraw' : '/pwa'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (!open) return self.clients.openWindow(target)
      await open.focus()
      open.postMessage({ type: 'ember-push-click', data })
      if (!new URL(open.url).pathname.startsWith('/pwa') && 'navigate' in open) await open.navigate(target)
    }),
  )
})

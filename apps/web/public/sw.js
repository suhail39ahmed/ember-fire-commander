/* EMBER app-shell service worker.
 * - Caches the shell (HTML, built assets, icons) so the installed app launches with no signal.
 *   The worker install caches index.html and every /assets/ file it references. The page then sends the
 *   /assets/ files it actually loaded (lazy chunks included), and each successful navigation refreshes the
 *   cached index.html, so an offline launch always finds a shell whose files are in the cache.
 * - NEVER caches API or gateway traffic: only same-origin GET requests are handled,
 *   and ember-api / voice-gateway are different origins (Cloud Run).
 * - Offline report replay runs in the page (src/pwa/outbox/), not in this worker.
 * - Shows background pushes sent by ember-api through FCM and opens the volunteer
 *   screen when one is tapped (registration lives in src/pwa/push/).
 */
const CACHE = 'ember-shell-v2'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/brand/ember-emblem.svg']
/** Built files kept in the cache. The oldest are dropped first, so old releases do not pile up on the phone. */
const MAX_ASSETS = 80
/** Message the page sends with the /assets/ files it loaded. Keep in step with src/pwa/install/shellAssets.ts. */
const CACHE_ASSETS = 'ember-cache-assets'

/** The /assets/ files an index.html points at (scripts, styles, preloads). */
function assetUrls(html) {
  const found = []
  const pattern = /(?:src|href)=["'](\/assets\/[^"']+)["']/g
  let match
  while ((match = pattern.exec(html)) !== null) {
    if (found.indexOf(match[1]) === -1) found.push(match[1])
  }
  return found
}

/** Keeps only plain same-origin /assets/ paths from a message the page sent. */
function safeAssetPaths(urls) {
  const paths = []
  for (const raw of urls.slice(0, MAX_ASSETS)) {
    if (typeof raw !== 'string') continue
    let path
    try {
      path = new URL(raw, self.location.origin)
    } catch {
      continue
    }
    if (path.origin !== self.location.origin || !path.pathname.startsWith('/assets/') || path.pathname.indexOf('..') !== -1) continue
    if (paths.indexOf(path.pathname) === -1) paths.push(path.pathname)
  }
  return paths
}

/** Fetches and stores any of these files not already cached. One failure does not stop the others. */
function cacheAssets(paths) {
  return caches
    .open(CACHE)
    .then((cache) =>
      Promise.all(
        paths.map((path) =>
          cache.match(path).then((hit) =>
            hit
              ? undefined
              : fetch(path)
                  .then((res) => (res.ok ? cache.put(path, res) : undefined))
                  .catch(() => undefined),
          ),
        ),
      ).then(() => trimAssets(cache)),
    )
    .catch(() => undefined)
}

/** Drops the oldest /assets/ entries beyond the limit. */
function trimAssets(cache) {
  return cache.keys().then((requests) => {
    const assets = requests.filter((r) => new URL(r.url).pathname.startsWith('/assets/'))
    return Promise.all(assets.slice(0, Math.max(0, assets.length - MAX_ASSETS)).map((r) => cache.delete(r)))
  })
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => caches.open(CACHE))
      .then((c) => c.match('/index.html'))
      .then((shell) => (shell ? shell.text() : ''))
      .then((html) => cacheAssets(assetUrls(html)))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// The page lists the built files it loaded, so lazy chunks that arrived before this worker took control are kept too.
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || data.type !== CACHE_ASSETS || !Array.isArray(data.urls)) return
  event.waitUntil(cacheAssets(safeAssetPaths(data.urls)))
})

/** Remember a fresh index.html. Only the app shell counts: Firebase's own pages under /__/ are left out. */
function refreshShell(event, res) {
  if (!res.ok || new URL(event.request.url).pathname.startsWith('/__/')) return
  let copy
  try {
    copy = res.clone()
  } catch {
    return
  }
  event.waitUntil(
    copy
      .clone()
      .text()
      .then((html) => {
        if (assetUrls(html).length === 0) return undefined
        return caches
          .open(CACHE)
          .then((cache) => cache.put('/index.html', copy).then(() => cacheAssets(assetUrls(html))))
      })
      .catch(() => undefined),
  )
}

/** Last resort when the network and the cache both miss: a plain network error, never an uncaught rejection. */
const offlineFallback = () => Response.error()

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Navigations: network first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          refreshShell(event, res)
          return res
        })
        .catch(() =>
          caches
            .match('/index.html')
            .then((shell) => shell || caches.match('/'))
            .then((shell) => shell || offlineFallback()),
        ),
    )
    return
  }
  // Static assets: cache first, then network (and remember hashed assets).
  event.respondWith(
    caches
      .match(req)
      .then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && url.pathname.startsWith('/assets/')) {
              const copy = res.clone()
              event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy).then(() => trimAssets(c))).catch(() => undefined))
            }
            return res
          }),
      )
      .catch(offlineFallback),
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

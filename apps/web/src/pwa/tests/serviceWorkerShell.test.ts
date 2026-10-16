// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

import { assetPathsFrom, CACHE_ASSETS_MESSAGE, MAX_ASSET_URLS } from '../install/shellAssets'

type Listener = (event: Record<string, unknown>) => void

const ORIGIN = 'https://ember.test'
const INDEX_HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-AAA.js"></script>
<link rel="modulepreload" crossorigin href="/assets/react-BBB.js">
<link rel="stylesheet" crossorigin href="/assets/index-CCC.css">
<link rel="icon" href="/favicon.svg">
</head><body><div id="root"></div></body></html>`

/** A worker scope with an in-memory Cache Storage and a network that serves `files`. Missing paths are a network failure. */
function loadWorker(files: Record<string, string>, initial: Record<string, string> = {}) {
  const listeners: Record<string, Listener> = {}
  const cache = new Map<string, string>(Object.entries(initial))
  const deleted: string[] = []
  const fetched: string[] = []
  const pathOf = (req: { url?: string } | string) => (typeof req === 'string' ? req : new URL(req.url as string).pathname)
  const cacheApi = {
    match: async (req: { url?: string } | string) => (cache.has(pathOf(req)) ? new Response(cache.get(pathOf(req))) : undefined),
    put: async (req: { url?: string } | string, res: Response) => void cache.set(pathOf(req), await res.text()),
    addAll: async (paths: string[]) => {
      for (const path of paths) {
        if (!(path in files)) throw new TypeError(`missing ${path}`)
        cache.set(path, files[path])
      }
    },
    keys: async () => [...cache.keys()].map((path) => ({ url: ORIGIN + path })),
    delete: async (req: { url?: string } | string) => {
      deleted.push(pathOf(req))
      return cache.delete(pathOf(req))
    },
  }
  const scope = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => void (listeners[type] = fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  }
  const fetchImpl = async (req: { url?: string } | string) => {
    const path = pathOf(req)
    fetched.push(path)
    if (!(path in files)) throw new TypeError('Failed to fetch')
    return new Response(files[path])
  }
  runInNewContext(readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8'), {
    self: scope,
    caches: { open: async () => cacheApi, match: cacheApi.match, keys: async () => ['ember-shell-v1', 'ember-shell-v2'], delete: async () => true },
    fetch: fetchImpl,
    URL,
    Response,
    Promise,
  })
  const run = async (type: string, event: Record<string, unknown>) => {
    const work: Promise<unknown>[] = []
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => work.push(p) })
    await Promise.all(work)
  }
  return { cache, deleted, fetched, run, listeners }
}

const shellFiles = (extra: Record<string, string> = {}) => ({
  '/': INDEX_HTML,
  '/index.html': INDEX_HTML,
  '/manifest.webmanifest': '{}',
  '/favicon.svg': '<svg/>',
  '/icons/icon-192.png': 'png',
  '/icons/icon-512.png': 'png',
  '/brand/ember-emblem.svg': '<svg/>',
  '/assets/index-AAA.js': 'js',
  '/assets/react-BBB.js': 'js',
  '/assets/index-CCC.css': 'css',
  ...extra,
})

describe('service worker install', () => {
  it('caches the shell and every built file index.html points at', async () => {
    const worker = loadWorker(shellFiles())
    await worker.run('install', {})
    for (const path of ['/index.html', '/assets/index-AAA.js', '/assets/react-BBB.js', '/assets/index-CCC.css']) {
      expect(worker.cache.has(path)).toBe(true)
    }
  })

  it('does not fail the install when a built file cannot be fetched', async () => {
    const files = shellFiles()
    delete (files as Record<string, string>)['/assets/index-CCC.css']
    const worker = loadWorker(files)
    await expect(worker.run('install', {})).resolves.toBeUndefined()
    expect(worker.cache.has('/assets/index-AAA.js')).toBe(true)
  })
})

describe('files the page loaded', () => {
  const message = (urls: unknown) => ({ data: { type: CACHE_ASSETS_MESSAGE, urls } })

  it('caches lazy chunks the page reports', async () => {
    const worker = loadWorker({ '/assets/VolunteerApp-DDD.js': 'js' })
    await worker.run('message', message(['/assets/VolunteerApp-DDD.js']))
    expect(worker.cache.get('/assets/VolunteerApp-DDD.js')).toBe('js')
  })

  it('does not fetch what is already cached', async () => {
    const worker = loadWorker({ '/assets/a.js': 'new' }, { '/assets/a.js': 'old' })
    await worker.run('message', message(['/assets/a.js']))
    expect(worker.fetched).toEqual([])
    expect(worker.cache.get('/assets/a.js')).toBe('old')
  })

  it('only takes plain same-origin /assets/ paths', async () => {
    const worker = loadWorker({ '/assets/ok.js': 'js', '/secret': 'x', '/api/me': 'x' })
    await worker.run(
      'message',
      message(['/assets/ok.js', '/secret', 'https://evil.test/assets/x.js', '/assets/../secret', 42, '/api/me']),
    )
    expect([...worker.cache.keys()]).toEqual(['/assets/ok.js'])
  })

  it('ignores other messages and a missing list', async () => {
    const worker = loadWorker({ '/assets/a.js': 'js' })
    await worker.run('message', { data: { type: 'something-else', urls: ['/assets/a.js'] } })
    await worker.run('message', { data: { type: CACHE_ASSETS_MESSAGE } })
    await worker.run('message', { data: null })
    expect(worker.cache.size).toBe(0)
  })

  it('survives a file that fails to download', async () => {
    const worker = loadWorker({ '/assets/b.js': 'js' })
    await expect(worker.run('message', message(['/assets/missing.js', '/assets/b.js']))).resolves.toBeUndefined()
    expect([...worker.cache.keys()]).toEqual(['/assets/b.js'])
  })

  it('drops the oldest built files beyond the limit', async () => {
    const initial: Record<string, string> = {}
    for (let i = 0; i < 80; i += 1) initial[`/assets/old-${i}.js`] = 'js'
    const worker = loadWorker({ '/assets/new-1.js': 'js', '/assets/new-2.js': 'js' }, initial)
    await worker.run('message', message(['/assets/new-1.js', '/assets/new-2.js']))
    expect(worker.deleted).toEqual(['/assets/old-0.js', '/assets/old-1.js'])
    expect(worker.cache.size).toBe(80)
  })
})

describe('navigation refreshes the cached shell', () => {
  const navigate = async (worker: ReturnType<typeof loadWorker>, path: string) => {
    const work: Promise<unknown>[] = []
    let answer: Promise<Response> | undefined
    worker.listeners.fetch({
      request: { method: 'GET', mode: 'navigate', url: ORIGIN + path },
      respondWith: (p: Promise<Response>) => void (answer = p),
      waitUntil: (p: Promise<unknown>) => work.push(p),
    })
    const res = await answer
    await Promise.all(work)
    return res as Response
  }

  it('stores the new index.html and the files it points at, and still answers the page', async () => {
    const fresh = INDEX_HTML.replace('AAA', 'ZZZ')
    const worker = loadWorker(shellFiles({ '/pwa': fresh, '/assets/index-ZZZ.js': 'js-new' }), { '/index.html': INDEX_HTML })
    const res = await navigate(worker, '/pwa')
    expect(await res.text()).toBe(fresh)
    expect(worker.cache.get('/index.html')).toBe(fresh)
    expect(worker.cache.get('/assets/index-ZZZ.js')).toBe('js-new')
  })

  it('leaves the cached shell alone for Firebase pages and for pages that are not the app', async () => {
    const worker = loadWorker({ '/__/auth/handler': '<html>auth</html>', '/offline-note': '<html>no app</html>' }, { '/index.html': INDEX_HTML })
    await navigate(worker, '/__/auth/handler')
    await navigate(worker, '/offline-note')
    expect(worker.cache.get('/index.html')).toBe(INDEX_HTML)
  })

  it('serves the stored shell when the network is down', async () => {
    const worker = loadWorker({}, { '/index.html': INDEX_HTML })
    const res = await navigate(worker, '/pwa')
    expect(await res.text()).toBe(INDEX_HTML)
  })
})

describe('assetPathsFrom', () => {
  it('lists the built files of this origin once each', () => {
    const entries = [
      { name: `${ORIGIN}/assets/index-AAA.js` },
      { name: `${ORIGIN}/assets/index-AAA.js` },
      { name: `${ORIGIN}/assets/VolunteerApp-DDD.js?x=1` },
      { name: `${ORIGIN}/favicon.svg` },
      { name: 'https://api.example/assets/digest.json' },
      { name: 'not a url' },
    ]
    expect(assetPathsFrom(entries, ORIGIN)).toEqual(['/assets/index-AAA.js', '/assets/VolunteerApp-DDD.js'])
  })

  it('stops at the limit', () => {
    const entries = Array.from({ length: MAX_ASSET_URLS + 20 }, (_, i) => ({ name: `${ORIGIN}/assets/f-${i}.js` }))
    expect(assetPathsFrom(entries, ORIGIN)).toHaveLength(MAX_ASSET_URLS)
  })
})

import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

import source from '../../../public/sw.js?raw'

type Handler = (event: unknown) => void

interface Setup {
  cached?: Record<string, Response>
  fetchImpl: () => Promise<Response>
}

/** Runs public/sw.js against a fake worker scope and returns its fetch handler. */
function loadWorker({ cached = {}, fetchImpl }: Setup) {
  const handlers: Record<string, Handler> = {}
  const fetchSpy = vi.fn(fetchImpl)
  const scope = {
    location: { origin: 'https://ember.test' },
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn
    },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  }
  const caches = {
    match: (req: Request | string) => Promise.resolve(cached[typeof req === 'string' ? req : new URL(req.url).pathname]),
    open: () => Promise.resolve({ put: () => Promise.resolve(), addAll: () => Promise.resolve() }),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
  }
  runInNewContext(source, { self: scope, caches, fetch: fetchSpy, URL, Response, Promise })
  return { fetchHandler: handlers.fetch, fetchSpy }
}

function dispatch(handler: Handler, request: { url: string; method?: string; mode?: string }) {
  const respondWith = vi.fn()
  handler({ request: { method: 'GET', mode: 'cors', ...request }, respondWith })
  return respondWith
}

const down = () => Promise.reject(new TypeError('Failed to fetch'))

describe('app-shell service worker', () => {
  it('answers a failed asset fetch with a network error instead of an uncaught rejection', async () => {
    const { fetchHandler } = loadWorker({ fetchImpl: down })
    const respondWith = dispatch(fetchHandler, { url: 'https://ember.test/assets/app.js' })
    const result = await respondWith.mock.calls[0][0]
    expect(result.type).toBe('error')
  })

  it('serves the cached shell when a navigation fails', async () => {
    const shell = new Response('<html></html>')
    const { fetchHandler } = loadWorker({ cached: { '/index.html': shell }, fetchImpl: down })
    const respondWith = dispatch(fetchHandler, { url: 'https://ember.test/pwa', mode: 'navigate' })
    await expect(respondWith.mock.calls[0][0]).resolves.toBe(shell)
  })

  it('falls back to the cached root when the index entry is missing', async () => {
    const root = new Response('<html></html>')
    const { fetchHandler } = loadWorker({ cached: { '/': root }, fetchImpl: down })
    const respondWith = dispatch(fetchHandler, { url: 'https://ember.test/pwa', mode: 'navigate' })
    await expect(respondWith.mock.calls[0][0]).resolves.toBe(root)
  })

  it('answers a failed navigation with a network error when nothing is cached', async () => {
    const { fetchHandler } = loadWorker({ fetchImpl: down })
    const respondWith = dispatch(fetchHandler, { url: 'https://ember.test/pwa', mode: 'navigate' })
    const result = await respondWith.mock.calls[0][0]
    expect(result.type).toBe('error')
  })

  it('serves cached assets without touching the network', async () => {
    const asset = new Response('body')
    const { fetchHandler, fetchSpy } = loadWorker({ cached: { '/assets/app.js': asset }, fetchImpl: down })
    const respondWith = dispatch(fetchHandler, { url: 'https://ember.test/assets/app.js' })
    await expect(respondWith.mock.calls[0][0]).resolves.toBe(asset)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('leaves API calls and other origins alone', () => {
    const { fetchHandler } = loadWorker({ fetchImpl: down })
    expect(dispatch(fetchHandler, { url: 'https://api.example/incidents' })).not.toHaveBeenCalled()
    expect(dispatch(fetchHandler, { url: 'https://ember.test/tasks', method: 'POST' })).not.toHaveBeenCalled()
  })
})

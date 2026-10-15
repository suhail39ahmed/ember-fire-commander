// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

type Listener = (event: Record<string, unknown>) => void

function openPage(url: string) {
  const page: Record<string, unknown> = { url, postMessage: vi.fn(), navigate: vi.fn() }
  page.focus = vi.fn(async () => page)
  return page as { url: string; focus: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn> }
}

/** Runs public/sw.js against a minimal worker scope and returns its listeners. */
function loadWorker(windows: Array<Record<string, unknown>> = []) {
  const listeners: Record<string, Listener> = {}
  const showNotification = vi.fn(async () => {})
  const openWindow = vi.fn(async () => null)
  const scope = {
    addEventListener: (name: string, fn: Listener) => { listeners[name] = fn },
    registration: { showNotification },
    clients: { matchAll: vi.fn(async () => windows), openWindow, claim: vi.fn() },
    location: { origin: 'https://app.test' },
    caches: {},
    skipWaiting: vi.fn(),
    URL,
  }
  runInNewContext(readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8'), { ...scope, self: scope, URL })
  return { listeners, showNotification, openWindow }
}

async function push(listeners: Record<string, Listener>, payload: unknown) {
  const work: Promise<unknown>[] = []
  listeners.push({ data: { json: () => payload }, waitUntil: (p: Promise<unknown>) => work.push(p) })
  await Promise.all(work)
}

async function tap(listeners: Record<string, Listener>, data: unknown) {
  const work: Promise<unknown>[] = []
  const close = vi.fn()
  listeners.notificationclick({ notification: { data, close }, waitUntil: (p: Promise<unknown>) => work.push(p) })
  await Promise.all(work)
  return close
}

describe('service worker push', () => {
  it('shows a background push with the title and body from the payload', async () => {
    const { listeners, showNotification } = loadWorker()
    await push(listeners, {
      notification: { title: 'EMBER', body: 'Check the east bank' },
      data: { taskId: 'task_1', incidentId: 'inc_1', type: 'verify' },
    })
    expect(showNotification).toHaveBeenCalledTimes(1)
    const [title, options] = showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(title).toBe('EMBER')
    expect(options.body).toBe('Check the east bank')
    expect(options.tag).toBe('task_1')
    expect(options.requireInteraction).toBe(false)
    expect(options.data).toEqual({ taskId: 'task_1', incidentId: 'inc_1', type: 'verify' })
  })

  it('keeps a WITHDRAW notification on screen until it is tapped', async () => {
    const { listeners, showNotification } = loadWorker()
    await push(listeners, { notification: { title: 'EMBER', body: 'Withdraw upwind' }, data: { taskId: 't2', type: 'withdraw' } })
    const options = (showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>])[1]
    expect(options.requireInteraction).toBe(true)
  })

  it('still shows a push that has no notification block', async () => {
    const { listeners, showNotification } = loadWorker()
    await push(listeners, { data: { type: 'verify' } })
    expect(showNotification).toHaveBeenCalledWith('EMBER', expect.objectContaining({ body: '' }))
  })

  it('shows a generic notification when the payload cannot be read', async () => {
    const { listeners, showNotification } = loadWorker()
    const work: Promise<unknown>[] = []
    listeners.push({ data: { json: () => { throw new Error('bad') } }, waitUntil: (p: Promise<unknown>) => work.push(p) })
    await Promise.all(work)
    expect(showNotification).toHaveBeenCalledWith('EMBER', expect.any(Object))
  })

  it('opens the volunteer screen on tap when the app is closed', async () => {
    const { listeners, openWindow } = loadWorker([])
    const close = await tap(listeners, { type: 'verify' })
    expect(close).toHaveBeenCalled()
    expect(openWindow).toHaveBeenCalledWith('/pwa')
  })

  it('opens the WITHDRAW screen on tap when the app is closed', async () => {
    const { listeners, openWindow } = loadWorker([])
    await tap(listeners, { type: 'withdraw', taskId: 't2' })
    expect(openWindow).toHaveBeenCalledWith('/pwa?push=withdraw')
  })

  it('focuses an open app, tells it to refresh and does not open another window', async () => {
    const open = openPage('https://app.test/pwa')
    const { listeners, openWindow } = loadWorker([open])
    await tap(listeners, { type: 'withdraw', taskId: 't2' })
    expect(open.focus).toHaveBeenCalled()
    expect(open.postMessage).toHaveBeenCalledWith({ type: 'ember-push-click', data: { type: 'withdraw', taskId: 't2' } })
    expect(open.navigate).not.toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('moves an open app on another page to the volunteer screen', async () => {
    const open = openPage('https://app.test/')
    const { listeners } = loadWorker([open])
    await tap(listeners, { type: 'withdraw' })
    expect(open.navigate).toHaveBeenCalledWith('/pwa?push=withdraw')
  })
})

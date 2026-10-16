import { describe, expect, it, vi } from 'vitest'

import { WakeLockHolder, type WakeLockApi, type WakeLockSentinelLike } from '../wakeLock'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function fakeApi() {
  const locks: Array<WakeLockSentinelLike & { released: boolean; fireRelease: () => void }> = []
  const request = vi.fn(async () => {
    let listener: () => void = () => {}
    const lock = {
      released: false,
      release: async () => {
        lock.released = true
      },
      addEventListener: (_type: 'release', fn: () => void) => {
        listener = fn
      },
      fireRelease: () => {
        lock.released = true
        listener()
      },
    }
    locks.push(lock)
    return lock
  })
  const api: WakeLockApi = { request }
  return { api, request, locks }
}

describe('WakeLockHolder', () => {
  it('requests a screen lock when wanted and releases it when no longer wanted', async () => {
    const { api, request, locks } = fakeApi()
    const holder = new WakeLockHolder(() => api, () => true)
    holder.setWanted(true)
    await settle()
    expect(request).toHaveBeenCalledWith('screen')
    expect(holder.held).toBe(true)
    holder.setWanted(false)
    await settle()
    expect(locks[0].released).toBe(true)
    expect(holder.held).toBe(false)
  })

  it('never requests a lock unless it is wanted', async () => {
    const { api, request } = fakeApi()
    const holder = new WakeLockHolder(() => api, () => true)
    holder.visibilityChanged()
    await settle()
    expect(request).not.toHaveBeenCalled()
  })

  it('holds only one lock however often it is asked', async () => {
    const { api, request } = fakeApi()
    const holder = new WakeLockHolder(() => api, () => true)
    holder.setWanted(true)
    holder.setWanted(true)
    holder.visibilityChanged()
    await settle()
    holder.visibilityChanged()
    await settle()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('asks again when the page returns after the browser dropped the lock', async () => {
    const { api, request, locks } = fakeApi()
    let visible = true
    const holder = new WakeLockHolder(() => api, () => visible)
    holder.setWanted(true)
    await settle()
    visible = false
    locks[0].fireRelease()
    holder.visibilityChanged()
    await settle()
    expect(request).toHaveBeenCalledTimes(1)
    expect(holder.held).toBe(false)
    visible = true
    holder.visibilityChanged()
    await settle()
    expect(request).toHaveBeenCalledTimes(2)
    expect(holder.held).toBe(true)
  })

  it('does not ask while the page is hidden', async () => {
    const { api, request } = fakeApi()
    const holder = new WakeLockHolder(() => api, () => false)
    holder.setWanted(true)
    await settle()
    expect(request).not.toHaveBeenCalled()
  })

  it('stays quiet when the browser has no wake lock or refuses the request', async () => {
    const none = new WakeLockHolder(() => undefined, () => true)
    expect(() => none.setWanted(true)).not.toThrow()
    expect(none.held).toBe(false)
    const refusing = new WakeLockHolder(() => ({ request: async () => { throw new DOMException('denied', 'NotAllowedError') } }), () => true)
    refusing.setWanted(true)
    await settle()
    expect(refusing.held).toBe(false)
  })

  it('lets go of a lock that arrives after the need has ended', async () => {
    let resolve!: (lock: WakeLockSentinelLike) => void
    const api: WakeLockApi = { request: () => new Promise((r) => (resolve = r)) }
    const holder = new WakeLockHolder(() => api, () => true)
    holder.setWanted(true)
    holder.setWanted(false)
    const lock = { release: vi.fn(async () => undefined), addEventListener: () => {} }
    resolve(lock)
    await settle()
    expect(lock.release).toHaveBeenCalled()
    expect(holder.held).toBe(false)
  })

  it('releases on dispose', async () => {
    const { api, locks } = fakeApi()
    const holder = new WakeLockHolder(() => api, () => true)
    holder.setWanted(true)
    await settle()
    holder.dispose()
    await settle()
    expect(locks[0].released).toBe(true)
  })
})

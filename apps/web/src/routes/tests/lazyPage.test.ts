import { describe, expect, it, vi } from 'vitest'

import { reloadOnceForChunk } from '../lazyPage'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    },
  }
}

describe('reloadOnceForChunk', () => {
  it('reloads the first time a page chunk fails', () => {
    const reload = vi.fn()
    const storage = memoryStorage()
    expect(reloadOnceForChunk(storage, reload, 1_000_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(storage.data['ember.chunk-reload']).toBe('1000000')
  })

  it('does not reload again straight away, so an outage cannot loop', () => {
    const reload = vi.fn()
    const storage = memoryStorage({ 'ember.chunk-reload': '1000000' })
    expect(reloadOnceForChunk(storage, reload, 1_010_000)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads again for a later failure', () => {
    const reload = vi.fn()
    const storage = memoryStorage({ 'ember.chunk-reload': '1000000' })
    expect(reloadOnceForChunk(storage, reload, 1_100_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('shows the error instead of reloading when storage is unavailable', () => {
    const reload = vi.fn()
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => undefined,
    }
    expect(reloadOnceForChunk(broken, reload, 1_000_000)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})

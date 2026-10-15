import { describe, expect, it, vi } from 'vitest'

import { getPosition, locate, watchLocationGranted, type GeoEnv, type GeoPermissionStatus } from '../report/location'

type Step = 'ok' | 'denied' | 'unavailable' | 'timeout'
const CODE = { denied: 1, unavailable: 2, timeout: 3 } as const

function geoEnv(steps: Step[], permission: string | null = 'prompt') {
  const calls = vi.fn()
  const queue = [...steps]
  const env: GeoEnv = {
    geolocation: {
      getCurrentPosition: (ok, err) => {
        calls()
        const step = queue.shift() ?? 'timeout'
        if (step === 'ok') ok({ coords: { latitude: -1.8492, longitude: 110.0508, accuracy: 12.4 } } as GeolocationPosition)
        else err?.({ code: CODE[step] } as GeolocationPositionError)
      },
    },
    permissions:
      permission === null
        ? null
        : { query: async () => ({ state: permission, addEventListener() {}, removeEventListener() {} }) },
  }
  return { env, calls }
}

describe('locate', () => {
  it('returns the position with a rounded accuracy', async () => {
    const { env } = geoEnv(['ok'])
    expect(await locate(env)).toEqual({ kind: 'ok', pos: { lat: -1.8492, lng: 110.0508, accuracyM: 12 } })
  })

  it('reports a denial as denied, not unavailable', async () => {
    const { env, calls } = geoEnv(['denied'], 'denied')
    expect(await locate(env)).toEqual({ kind: 'denied' })
    expect(calls).toHaveBeenCalledTimes(1)
  })

  it('reports a missing fix as unavailable', async () => {
    const { env } = geoEnv(['unavailable'])
    expect(await locate(env)).toEqual({ kind: 'unavailable' })
  })

  it('reports a phone without geolocation as unavailable', async () => {
    expect(await locate({ geolocation: null, permissions: null })).toEqual({ kind: 'unavailable' })
  })

  it('keeps waiting while the permission prompt is open, then returns the position once it is allowed', async () => {
    const { env, calls } = geoEnv(['timeout', 'timeout', 'ok'], 'prompt')
    expect(await locate(env)).toMatchObject({ kind: 'ok' })
    expect(calls).toHaveBeenCalledTimes(3)
  })

  it('treats a denial after waiting as denied', async () => {
    const { env } = geoEnv(['timeout', 'denied'], 'prompt')
    expect(await locate(env)).toEqual({ kind: 'denied' })
  })

  it('reports a timeout as unavailable when no prompt is open', async () => {
    const { env, calls } = geoEnv(['timeout'], 'granted')
    expect(await locate(env)).toEqual({ kind: 'unavailable' })
    expect(calls).toHaveBeenCalledTimes(1)
  })

  it('reports a timeout as unavailable when the browser cannot report permissions', async () => {
    const { env, calls } = geoEnv(['timeout'], null)
    expect(await locate(env)).toEqual({ kind: 'unavailable' })
    expect(calls).toHaveBeenCalledTimes(1)
  })

  it('reports a timeout as unavailable when reading the permission fails', async () => {
    const { env } = geoEnv(['timeout'])
    env.permissions = { query: () => Promise.reject(new Error('unsupported')) }
    expect(await locate(env)).toEqual({ kind: 'unavailable' })
  })

  it('gives up after a bounded number of waits', async () => {
    const { env, calls } = geoEnv([], 'prompt')
    expect(await locate(env, { maxAttempts: 3 })).toEqual({ kind: 'unavailable' })
    expect(calls).toHaveBeenCalledTimes(3)
  })
})

describe('getPosition', () => {
  it('returns the position, or null for any failure', async () => {
    expect(await getPosition(geoEnv(['ok']).env)).toEqual({ lat: -1.8492, lng: 110.0508, accuracyM: 12 })
    expect(await getPosition(geoEnv(['denied'], 'denied').env)).toBeNull()
    expect(await getPosition(geoEnv(['unavailable']).env)).toBeNull()
  })
})

describe('watchLocationGranted', () => {
  function watched(initial = 'denied') {
    const listeners = new Set<() => void>()
    const status: GeoPermissionStatus = {
      state: initial,
      addEventListener: (_t, l) => listeners.add(l),
      removeEventListener: (_t, l) => listeners.delete(l),
    }
    const env: GeoEnv = { geolocation: null, permissions: { query: async () => status } }
    const change = (state: string) => {
      status.state = state
      listeners.forEach((l) => l())
    }
    return { env, change, listeners }
  }

  it('calls back when the permission becomes granted, and not for other changes', async () => {
    const { env, change } = watched()
    const onGranted = vi.fn()
    watchLocationGranted(onGranted, env)
    await Promise.resolve()
    change('prompt')
    change('denied')
    expect(onGranted).not.toHaveBeenCalled()
    change('granted')
    expect(onGranted).toHaveBeenCalledTimes(1)
  })

  it('stops listening when stopped', async () => {
    const { env, change, listeners } = watched()
    const onGranted = vi.fn()
    const stop = watchLocationGranted(onGranted, env)
    await Promise.resolve()
    expect(listeners.size).toBe(1)
    stop()
    expect(listeners.size).toBe(0)
    change('granted')
    expect(onGranted).not.toHaveBeenCalled()
  })

  it('does not attach if stopped before the permission was read', async () => {
    const { env, listeners } = watched()
    const stop = watchLocationGranted(() => {}, env)
    stop()
    await Promise.resolve()
    expect(listeners.size).toBe(0)
  })

  it('does nothing in a browser without the permissions API', () => {
    const stop = watchLocationGranted(() => {}, { geolocation: null, permissions: null })
    expect(() => stop()).not.toThrow()
  })
})

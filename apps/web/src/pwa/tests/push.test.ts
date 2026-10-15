import { describe, expect, it, vi } from 'vitest'
import { PUSH_TOKEN_KEY, PUSH_TOKEN_PATH, registerPush, unregisterPush, type MessagingPort, type PushClient } from '../push/pushClient'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => { data[k] = v },
    removeItem: (k: string) => { delete data[k] },
  }
}

function setup(over: Partial<PushClient> = {}, messaging: Partial<MessagingPort> = {}) {
  const port: MessagingPort = {
    isSupported: vi.fn(async () => true),
    getToken: vi.fn(async () => 'fcm-token-1'),
    deleteToken: vi.fn(async () => {}),
    ...messaging,
  }
  const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
  const storage = memoryStorage()
  const client: PushClient = {
    messaging: port,
    getAuthHeaders: async () => ({ Authorization: 'Bearer id-token' }),
    baseUrl: 'https://api.test',
    vapidKey: 'vapid-key',
    permission: () => 'granted',
    storage,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...over,
  }
  return { client, port, fetchImpl, storage }
}

describe('registerPush', () => {
  it('gets a token with the web push key and sends it to ember-api', async () => {
    const { client, port, fetchImpl, storage } = setup()
    expect(await registerPush(client)).toBe('registered')
    expect(port.getToken).toHaveBeenCalledWith('vapid-key')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.test${PUSH_TOKEN_PATH}`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ token: 'fcm-token-1' })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer id-token')
    expect(storage.data[PUSH_TOKEN_KEY]).toBe('fcm-token-1')
  })

  it.each(['denied', 'default', 'unsupported'] as const)('does nothing when permission is %s', async (permission) => {
    const { client, port, fetchImpl, storage } = setup({ permission: () => permission })
    expect(await registerPush(client)).toBe('not-granted')
    expect(port.getToken).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(storage.data).toEqual({})
  })

  it('does nothing without the web push key', async () => {
    const { client, port, fetchImpl } = setup({ vapidKey: '' })
    expect(await registerPush(client)).toBe('no-key')
    expect(port.getToken).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does nothing in a browser without push support', async () => {
    const { client, port, fetchImpl } = setup({}, { isSupported: async () => false })
    expect(await registerPush(client)).toBe('unsupported')
    expect(port.getToken).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not call ember-api when signed out', async () => {
    const { client, fetchImpl, storage } = setup({ getAuthHeaders: async () => null })
    expect(await registerPush(client)).toBe('failed')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(storage.data).toEqual({})
  })

  it('does not throw when FCM fails, and records nothing', async () => {
    const { client, fetchImpl, storage } = setup({}, { getToken: async () => { throw new Error('blocked') } })
    expect(await registerPush(client)).toBe('failed')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(storage.data).toEqual({})
  })

  it('does not remember a token ember-api refused', async () => {
    const refused = vi.fn(async () => new Response('{}', { status: 403 }))
    const { client, storage } = setup({ fetchImpl: refused as unknown as typeof fetch })
    expect(await registerPush(client)).toBe('failed')
    expect(storage.data).toEqual({})
  })

  it('does not throw when the network is down', async () => {
    const down = vi.fn(async () => { throw new TypeError('offline') })
    const { client } = setup({ fetchImpl: down as unknown as typeof fetch })
    expect(await registerPush(client)).toBe('failed')
  })
})

describe('unregisterPush', () => {
  it('removes the token from ember-api and from FCM, then forgets it', async () => {
    const { client, port, fetchImpl, storage } = setup()
    storage.data[PUSH_TOKEN_KEY] = 'fcm-token-1'
    await unregisterPush(client)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.test${PUSH_TOKEN_PATH}`)
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(init.body as string)).toEqual({ token: 'fcm-token-1' })
    expect(port.deleteToken).toHaveBeenCalledTimes(1)
    expect(storage.data).toEqual({})
  })

  it('does nothing when this browser never registered', async () => {
    const { client, port, fetchImpl } = setup()
    await unregisterPush(client)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(port.deleteToken).not.toHaveBeenCalled()
  })

  it('still clears FCM and local state when ember-api is unreachable', async () => {
    const down = vi.fn(async () => { throw new TypeError('offline') })
    const { client, port, storage } = setup({ fetchImpl: down as unknown as typeof fetch })
    storage.data[PUSH_TOKEN_KEY] = 'fcm-token-1'
    await unregisterPush(client)
    expect(port.deleteToken).toHaveBeenCalledTimes(1)
    expect(storage.data).toEqual({})
  })

  it('does not hold sign-out up when a call hangs', async () => {
    const { client, storage } = setup(
      { timeoutMs: 20 },
      { deleteToken: () => new Promise<void>(() => {}) },
    )
    storage.data[PUSH_TOKEN_KEY] = 'fcm-token-1'
    await unregisterPush(client)
    expect(storage.data).toEqual({})
  })
})

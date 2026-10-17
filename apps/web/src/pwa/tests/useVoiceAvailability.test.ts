import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SocketLike } from '../gateway/pttSession'

// The web tests run without a DOM, so the two hooks the check uses are stood in for here:
// useState keeps the latest value, and useEffect records its callback and dependency list.
const hooks = vi.hoisted(() => ({
  state: undefined as unknown,
  effects: [] as { run: () => void | (() => void); deps: unknown[] }[],
}))

vi.mock('react', () => ({
  useState: (init: unknown) => {
    hooks.state = typeof init === 'function' ? (init as () => unknown)() : init
    return [hooks.state, (next: unknown) => { hooks.state = next }]
  },
  useEffect: (run: () => void | (() => void), deps: unknown[]) => {
    hooks.effects.push({ run, deps })
  },
}))

import { useVoiceAvailability } from '../gateway/useVoiceAvailability'

const auth = async () => ({ Authorization: 'Bearer id-token' })

function openSocket(): SocketLike {
  const s: SocketLike = {
    readyState: 0,
    send() {},
    close() {},
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  }
  queueMicrotask(() => s.onopen?.(new Event('open')))
  return s
}

beforeEach(() => {
  hooks.state = undefined
  hooks.effects = []
})

describe('useVoiceAvailability', () => {
  it('fetches one ticket for the check, hands it to the socket factory and reports ready', async () => {
    const getTicket = vi.fn(async () => 'tok_abc')
    const createSocket = vi.fn(() => openSocket())

    useVoiceAvailability({ url: 'wss://gw', getAuthHeaders: auth, createSocket, getTicket })
    expect(hooks.effects).toHaveLength(1)
    hooks.effects[0].run()

    await vi.waitFor(() => expect(hooks.state).toBe('ready'))
    expect(getTicket).toHaveBeenCalledTimes(1)
    expect(createSocket).toHaveBeenCalledTimes(1)
    expect(createSocket).toHaveBeenCalledWith('wss://gw', { Authorization: 'Bearer id-token' }, 'tok_abc')
  })

  it('reports unavailable when the ticket cannot be fetched', async () => {
    const createSocket = vi.fn(() => openSocket())

    useVoiceAvailability({ url: 'wss://gw', getAuthHeaders: auth, createSocket, getTicket: async () => null })
    hooks.effects[0].run()

    await vi.waitFor(() => expect(hooks.state).toBe('unavailable'))
    expect(createSocket).not.toHaveBeenCalled()
  })

  it('lists getTicket in the effect dependencies, so the check reruns only when the ticket source changes', () => {
    const getAuthHeaders = auth
    const createSocket = vi.fn()
    const getTicket = async () => 'tok_abc'

    useVoiceAvailability({ url: 'wss://gw', getAuthHeaders, createSocket, getTicket })
    expect(hooks.effects[0].deps).toContain(getTicket)
    expect(hooks.effects[0].deps).toEqual(['wss://gw', getAuthHeaders, createSocket, getTicket, undefined])
  })

  it('does not fetch a ticket when no gateway URL is configured', () => {
    const getTicket = vi.fn(async () => 'tok_abc')

    useVoiceAvailability({ url: '', getAuthHeaders: auth, createSocket: vi.fn(), getTicket })
    hooks.effects[0].run()

    expect(hooks.state).toBe('unavailable')
    expect(getTicket).not.toHaveBeenCalled()
  })
})

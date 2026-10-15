import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserSocketFactory, type SocketLike } from '../gateway/pttSession'
import { initialVoiceAvailability, probeVoice, VOICE_PROBE_TIMEOUT_MS } from '../gateway/voiceAvailability'

const auth = async () => ({ Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-check' })

function fakeSocket() {
  const s: SocketLike & { closed: boolean; sent: string[] } = {
    readyState: 0,
    closed: false,
    sent: [],
    send(d: string) { this.sent.push(d) },
    close() { this.closed = true },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  }
  return s
}

afterEach(() => {
  vi.useRealTimers()
})

describe('initialVoiceAvailability', () => {
  it('is unavailable at once when no gateway URL is configured, and checking otherwise', () => {
    expect(initialVoiceAvailability('')).toBe('unavailable')
    expect(initialVoiceAvailability('wss://gw')).toBe('checking')
  })
})

describe('probeVoice', () => {
  it('is unavailable without a gateway URL and never builds a socket', async () => {
    const createSocket = vi.fn()
    expect(await probeVoice({ url: '', getAuthHeaders: auth, createSocket })).toBe('unavailable')
    expect(createSocket).not.toHaveBeenCalled()
  })

  it('reports signed_out when there are no identity headers', async () => {
    const createSocket = vi.fn()
    expect(await probeVoice({ url: 'wss://gw', getAuthHeaders: async () => null, createSocket })).toBe('signed_out')
    expect(createSocket).not.toHaveBeenCalled()
  })

  it('is unavailable in a browser, where the socket cannot carry the identity headers', async () => {
    expect(await probeVoice({ url: 'wss://gw', getAuthHeaders: auth, createSocket: browserSocketFactory })).toBe('unavailable')
  })

  it('is unavailable when the factory throws', async () => {
    const createSocket = () => {
      throw new Error('blocked')
    }
    expect(await probeVoice({ url: 'wss://gw', getAuthHeaders: auth, createSocket })).toBe('unavailable')
  })

  it('is ready when the gateway is reachable, passes both headers, and closes the probe without starting a session', async () => {
    const sock = fakeSocket()
    const createSocket = vi.fn(() => sock)
    const result = probeVoice({ url: 'wss://gw', getAuthHeaders: auth, createSocket })
    await vi.waitFor(() => expect(sock.onopen).not.toBeNull())
    sock.onopen?.(new Event('open'))
    expect(await result).toBe('ready')
    expect(createSocket).toHaveBeenCalledWith('wss://gw', { Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-check' })
    expect(sock.sent).toEqual([])
    expect(sock.closed).toBe(true)
  })

  it('is unavailable when the socket errors or closes before it opens', async () => {
    for (const event of ['onerror', 'onclose'] as const) {
      const sock = fakeSocket()
      const result = probeVoice({ url: 'wss://gw', getAuthHeaders: auth, createSocket: () => sock })
      await vi.waitFor(() => expect(sock[event]).not.toBeNull())
      sock[event]?.(new Event('x') as never)
      expect(await result).toBe('unavailable')
      expect(sock.closed).toBe(true)
    }
  })

  it('is unavailable when the gateway does not answer in time, and a late open changes nothing', async () => {
    vi.useFakeTimers()
    const sock = fakeSocket()
    const result = probeVoice({ url: 'wss://gw', getAuthHeaders: auth, createSocket: () => sock })
    await vi.advanceTimersByTimeAsync(VOICE_PROBE_TIMEOUT_MS - 1)
    expect(sock.closed).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toBe('unavailable')
    expect(sock.closed).toBe(true)
    expect(sock.onopen).toBeNull()
  })
})

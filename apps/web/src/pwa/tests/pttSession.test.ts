import { describe, expect, it, vi } from 'vitest'
import { browserSocketFactory, PttSession, type SessionState, type SocketLike } from '../gateway/pttSession'

const auth = async () => ({ Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-check' })

function fakeSocket() {
  const sent: string[] = []
  const s: SocketLike & { closed: boolean; sent: string[] } = {
    readyState: 0,
    closed: false,
    sent,
    send: (d: string) => { sent.push(d) },
    close() { this.closed = true },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  }
  return s
}
const msg = (data: unknown) => new MessageEvent('message', { data: JSON.stringify(data) })

describe('PttSession', () => {
  it('does not open a socket when signed out', async () => {
    const createSocket = vi.fn()
    const p = new PttSession({ url: 'wss://gw', getAuthHeaders: async () => null, createSocket, onState: () => {} })
    expect(await p.press()).toBe('signed_out')
    expect(createSocket).not.toHaveBeenCalled()
  })

  it('passes both identity headers and ticket to the socket factory', async () => {
    const createSocket = vi.fn(() => fakeSocket())
    const getTicket = async () => 'tok_abc'
    const p = new PttSession({ url: 'wss://gw', getAuthHeaders: auth, createSocket, getTicket, onState: () => {} })
    await p.press()
    expect(createSocket).toHaveBeenCalledWith(
      'wss://gw',
      { Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-check' },
      'tok_abc',
    )
  })

  it('passes headers without a ticket when no getTicket is provided', async () => {
    const createSocket = vi.fn(() => fakeSocket())
    const p = new PttSession({ url: 'wss://gw', getAuthHeaders: auth, createSocket, onState: () => {} })
    await p.press()
    expect(createSocket).toHaveBeenCalledWith(
      'wss://gw',
      { Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-check' },
      undefined,
    )
  })

  it('returns no_gateway when getTicket returns null', async () => {
    const createSocket = vi.fn(() => fakeSocket())
    const p = new PttSession({ url: 'wss://gw', getAuthHeaders: auth, createSocket, getTicket: async () => null, onState: () => {} })
    expect(await p.press()).toBe('no_gateway')
    expect(createSocket).not.toHaveBeenCalled()
  })

  it('reports unsupported when the factory returns null (no ticket provided in browser)', async () => {
    const p = new PttSession({ url: 'wss://gw', getAuthHeaders: auth, createSocket: browserSocketFactory, onState: () => {} })
    expect(await p.press()).toBe('unsupported')
    expect(p.isOpen).toBe(false)
  })

  it('sends session.start, goes live on session.ready and closes on session.closed', async () => {
    const sock = fakeSocket()
    const states: SessionState[] = []
    const p = new PttSession({ url: 'wss://gw', getAuthHeaders: auth, createSocket: () => sock, onState: (s) => states.push(s) })
    expect(await p.press()).toBe('opened')
    sock.onopen?.(new Event('open'))
    expect(sock.sent.map((d) => JSON.parse(d).type)).toEqual(['session.start'])
    sock.onmessage?.(msg({ type: 'session.ready' }))
    p.release()
    sock.onmessage?.(msg({ type: 'session.closed', reason: 'reply_complete' }))
    expect(sock.closed).toBe(true)
    expect(states).toEqual(['connecting', 'live', 'waiting', 'idle'])
  })

  it('sends session.stop and closes about 30 s after release', async () => {
    vi.useFakeTimers()
    const sock = fakeSocket()
    const p = new PttSession({ url: 'wss://gw', getAuthHeaders: auth, createSocket: () => sock, onState: () => {} })
    await p.press()
    p.release()
    vi.advanceTimersByTime(29_999)
    expect(sock.closed).toBe(false)
    vi.advanceTimersByTime(1)
    expect(sock.sent.map((d) => JSON.parse(d).type)).toContain('session.stop')
    expect(sock.closed).toBe(true)
    vi.useRealTimers()
  })

  it('sendAudio sends an audio message while live', async () => {
    const sock = fakeSocket()
    const p = new PttSession({ url: 'wss://gw', getAuthHeaders: auth, createSocket: () => sock, onState: () => {} })
    await p.press()
    sock.onopen?.(new Event('open'))
    sock.onmessage?.(msg({ type: 'session.ready' }))
    p.sendAudio('base64pcm')
    const parsed = sock.sent.map((d) => JSON.parse(d))
    expect(parsed.find((m) => m.type === 'audio')).toEqual({ type: 'audio', data: 'base64pcm' })
  })

  it('sendAudio is a no-op when not live', async () => {
    const sock = fakeSocket()
    const p = new PttSession({ url: 'wss://gw', getAuthHeaders: auth, createSocket: () => sock, onState: () => {} })
    p.sendAudio('should-not-send')
    expect(sock.sent).toHaveLength(0)
  })

  it('sendFrame sends a frame message while live', async () => {
    const sock = fakeSocket()
    const p = new PttSession({ url: 'wss://gw', getAuthHeaders: auth, createSocket: () => sock, onState: () => {} })
    await p.press()
    sock.onopen?.(new Event('open'))
    sock.onmessage?.(msg({ type: 'session.ready' }))
    p.sendFrame('base64jpeg', '2026-10-17T08:00:00Z')
    const parsed = sock.sent.map((d) => JSON.parse(d))
    expect(parsed.find((m) => m.type === 'frame')).toEqual({ type: 'frame', data: 'base64jpeg', capturedAt: '2026-10-17T08:00:00Z' })
  })
})

describe('browserSocketFactory', () => {
  it('returns null when no ticket is provided', () => {
    expect(browserSocketFactory('wss://gw', { Authorization: 'Bearer t' })).toBeNull()
  })

  it('returns null when ticket is empty string', () => {
    expect(browserSocketFactory('wss://gw', { Authorization: 'Bearer t' }, '')).toBeNull()
  })
})

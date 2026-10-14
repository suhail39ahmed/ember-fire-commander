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

  it('passes both identity headers to the socket factory and never puts a token in the URL', async () => {
    const createSocket = vi.fn(() => fakeSocket())
    const p = new PttSession({ url: 'wss://gw', getAuthHeaders: auth, createSocket, onState: () => {} })
    await p.press()
    expect(createSocket).toHaveBeenCalledWith('wss://gw', { Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-check' })
  })

  it('reports unsupported when the runtime cannot send upgrade headers', async () => {
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
})

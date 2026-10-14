/**
 * Push-to-talk session with voice-gateway (contract section 7).
 * - Opens only for a signed-in user. The upgrade must carry the two identity
 *   headers from section 2, so the socket factory receives them.
 * - Sends session.start once the socket is open and session.stop when done.
 * - Closes on session.closed, or about 30 s after the volunteer lets go.
 * Audio capture and framing belong to the gateway workstream; this module
 * only manages the session lifecycle.
 */
import type { AuthHeaders, AuthHeadersProvider } from '../api/authHeaders'

export const REPLY_TIMEOUT_MS = 30_000

export type SessionState = 'idle' | 'connecting' | 'live' | 'waiting' | 'lost'
export type PressResult = 'opened' | 'no_gateway' | 'signed_out' | 'unsupported'

export interface SocketLike {
  readyState: number
  send(data: string): void
  close(code?: number): void
  onopen: ((ev: Event) => void) | null
  onmessage: ((ev: MessageEvent) => void) | null
  onclose: ((ev: CloseEvent) => void) | null
  onerror: ((ev: Event) => void) | null
}

/** Returns null when this runtime cannot send the identity headers on the upgrade. */
export type SocketFactory = (url: string, headers: AuthHeaders) => SocketLike | null

export interface GatewayMessage {
  type: string
  [key: string]: unknown
}

export interface PttDeps {
  url: string
  getAuthHeaders: AuthHeadersProvider
  createSocket: SocketFactory
  onState: (s: SessionState) => void
  onMessage?: (msg: GatewayMessage) => void
  timeoutMs?: number
}

/**
 * The browser WebSocket API cannot set request headers, so it cannot meet the
 * section 2 handshake. Until the contract defines a browser-compatible
 * handshake, the PWA reports voice as unavailable and the quick report is used.
 */
export const browserSocketFactory: SocketFactory = () => null

export class PttSession {
  private socket: SocketLike | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private state: SessionState = 'idle'

  constructor(private readonly deps: PttDeps) {}

  get current(): SessionState {
    return this.state
  }

  get isOpen(): boolean {
    return this.socket !== null
  }

  private set(s: SessionState) {
    this.state = s
    this.deps.onState(s)
  }

  async press(): Promise<PressResult> {
    if (this.socket) return 'opened'
    if (!this.deps.url) return 'no_gateway'
    const headers = await this.deps.getAuthHeaders()
    if (!headers) return 'signed_out'
    const ws = this.deps.createSocket(this.deps.url, headers)
    if (!ws) return 'unsupported'
    this.socket = ws
    this.set('connecting')
    ws.onopen = () => this.sendJson({ type: 'session.start' })
    ws.onmessage = (ev) => this.handle(ev)
    ws.onerror = () => this.close('lost')
    ws.onclose = () => {
      if (this.socket === ws) this.close(this.state === 'idle' ? 'idle' : 'lost')
    }
    return 'opened'
  }

  /** The volunteer let go: wait for the reply, then stop after the timeout. */
  release() {
    if (!this.socket) return
    if (this.state === 'live' || this.state === 'connecting') this.set('waiting')
    this.armTimer()
  }

  /** Send session.stop and close. */
  stop() {
    this.sendJson({ type: 'session.stop' })
    this.close('idle')
  }

  close(next: SessionState = 'idle') {
    this.clearTimer()
    const ws = this.socket
    this.socket = null
    if (ws) {
      ws.onclose = null
      try {
        ws.close(1000)
      } catch {
        // already closed
      }
    }
    this.set(next)
  }

  private handle(ev: MessageEvent) {
    let msg: GatewayMessage
    try {
      msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as GatewayMessage
    } catch {
      return
    }
    if (msg.type === 'session.ready') {
      if (this.state === 'connecting') this.set('live')
      return
    }
    if (msg.type === 'session.closed') {
      this.deps.onMessage?.(msg)
      this.close(msg.reason === 'unauthorized' ? 'lost' : 'idle')
      return
    }
    this.deps.onMessage?.(msg)
    if (this.state === 'waiting') this.armTimer()
  }

  private sendJson(msg: GatewayMessage) {
    try {
      this.socket?.send(JSON.stringify(msg))
    } catch {
      // socket already closing
    }
  }

  private armTimer() {
    this.clearTimer()
    this.timer = setTimeout(() => this.stop(), this.deps.timeoutMs ?? REPLY_TIMEOUT_MS)
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}

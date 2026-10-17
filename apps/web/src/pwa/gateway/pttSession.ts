/**
 * Push-to-talk session with voice-gateway (contract section 7).
 *
 * Browser path (PWA): the caller supplies a `getTicket` function that fetches
 * a short-lived voice ticket from ember-api. The ticket is passed as the
 * WebSocket subprotocol so the browser can open the socket without setting
 * auth headers, which the WebSocket API does not support. `browserSocketFactory`
 * implements this path and requires `getTicket` in `PttDeps`.
 *
 * Native path: the socket factory receives the identity headers and can set
 * them on the upgrade request directly.
 *
 * Audio capture and playback belong to the callers (VolunteerProvider); this
 * module manages the session lifecycle and exposes `sendAudio` and `sendFrame`.
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

/** Returns null when this runtime cannot open an authenticated socket. */
export type SocketFactory = (url: string, headers: AuthHeaders, ticket?: string) => SocketLike | null

export interface GatewayMessage {
  type: string
  [key: string]: unknown
}

export interface PttDeps {
  url: string
  getAuthHeaders: AuthHeadersProvider
  createSocket: SocketFactory
  /** Fetch a short-lived voice ticket from ember-api for the browser WebSocket path. */
  getTicket?: () => Promise<string | null>
  onState: (s: SessionState) => void
  onMessage?: (msg: GatewayMessage) => void
  timeoutMs?: number
}

/**
 * Browser socket factory for the PWA. Opens the WebSocket with the voice ticket
 * as the subprotocol (§7 browser handshake). Returns null when no ticket was
 * provided (voice unavailable path for probing before the first press).
 */
export const browserSocketFactory: SocketFactory = (url, _headers, ticket) => {
  if (!ticket) return null
  return new WebSocket(url, [ticket]) as unknown as SocketLike
}

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
    let ticket: string | undefined
    if (this.deps.getTicket) {
      const t = await this.deps.getTicket()
      if (!t) return 'no_gateway'
      ticket = t
    }
    const ws = this.deps.createSocket(this.deps.url, headers, ticket)
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

  /** Send a base64 PCM audio frame to the gateway while the session is live. */
  sendAudio(base64: string): void {
    if (this.state === 'live' || this.state === 'connecting') {
      this.sendJson({ type: 'audio', data: base64 })
    }
  }

  /** Send a base64 JPEG camera frame to the gateway. */
  sendFrame(base64: string, capturedAt?: string): void {
    if (this.state === 'live' || this.state === 'connecting') {
      const msg: GatewayMessage = { type: 'frame', data: base64 }
      if (capturedAt) msg.capturedAt = capturedAt
      this.sendJson(msg)
    }
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

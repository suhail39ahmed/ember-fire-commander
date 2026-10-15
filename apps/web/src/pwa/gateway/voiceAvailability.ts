/**
 * Is push-to-talk usable right now? Answered once on load so the Hold to talk
 * button shows its real state before the first press (#74).
 *
 * The probe only opens the socket and waits for it to open. It never sends
 * session.start, and it always closes the socket again.
 */
import type { AuthHeadersProvider } from '../api/authHeaders'
import type { SocketFactory } from './pttSession'

export type VoiceAvailability = 'checking' | 'ready' | 'unavailable' | 'signed_out'

export const VOICE_PROBE_TIMEOUT_MS = 4000

export interface VoiceProbeDeps {
  url: string
  getAuthHeaders: AuthHeadersProvider
  createSocket: SocketFactory
  timeoutMs?: number
}

/** With no gateway URL there is nothing to check, so the answer is known on the first render. */
export function initialVoiceAvailability(url: string): VoiceAvailability {
  return url ? 'checking' : 'unavailable'
}

export async function probeVoice(deps: VoiceProbeDeps): Promise<Exclude<VoiceAvailability, 'checking'>> {
  if (!deps.url) return 'unavailable'
  const headers = await deps.getAuthHeaders()
  if (!headers) return 'signed_out'

  let ws: ReturnType<SocketFactory>
  try {
    ws = deps.createSocket(deps.url, headers)
  } catch {
    return 'unavailable'
  }
  if (!ws) return 'unavailable'
  const socket = ws

  return new Promise((resolve) => {
    let done = false
    const finish = (result: 'ready' | 'unavailable') => {
      if (done) return
      done = true
      clearTimeout(timer)
      socket.onopen = null
      socket.onerror = null
      socket.onclose = null
      try {
        socket.close(1000)
      } catch {
        // already closed
      }
      resolve(result)
    }
    const timer = setTimeout(() => finish('unavailable'), deps.timeoutMs ?? VOICE_PROBE_TIMEOUT_MS)
    socket.onopen = () => finish('ready')
    socket.onerror = () => finish('unavailable')
    socket.onclose = () => finish('unavailable')
  })
}

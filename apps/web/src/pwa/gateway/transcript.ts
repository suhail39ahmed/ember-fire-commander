import type { GatewayMessage } from './pttSession'

/**
 * Pull a transcript line from a gateway message when the socket already emits one (#129).
 * Unknown shapes are ignored — we never invent spoken words in the browser.
 */
export function transcriptOf(msg: GatewayMessage): string | null {
  if (msg.type !== 'transcript' && msg.type !== 'partial' && msg.type !== 'input_transcript') return null
  for (const key of ['text', 'transcript', 'partial'] as const) {
    const value = msg[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/** Coach reply text from a gateway message (#130). Audio may arrive separately as `audio`. */
export function coachTextOf(msg: GatewayMessage): string | null {
  if (msg.type !== 'reply' && msg.type !== 'coach' && msg.type !== 'model_text') return null
  for (const key of ['text', 'reply', 'content'] as const) {
    const value = msg[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/**
 * Receipt fields from a gateway coach message (#130). Only strings already on the payload —
 * never invent a phone clock or incident code here.
 */
export function coachReceiptOf(msg: GatewayMessage): { receivedAt: string | null; incidentLabel: string | null } {
  if (msg.type !== 'reply' && msg.type !== 'coach' && msg.type !== 'model_text') {
    return { receivedAt: null, incidentLabel: null }
  }
  const receivedAt =
    typeof msg.receivedAt === 'string' && msg.receivedAt.trim() ? msg.receivedAt.trim() : null
  let incidentLabel: string | null = null
  for (const key of ['incidentLabel', 'incidentName'] as const) {
    const value = msg[key]
    if (typeof value === 'string' && value.trim()) {
      incidentLabel = value.trim()
      break
    }
  }
  return { receivedAt, incidentLabel }
}

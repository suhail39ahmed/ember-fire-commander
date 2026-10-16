import type { ObservationCreate } from '../contracts/types'
import { ApiError } from '../api/types'
import { buildObservation, validateDraft, type DraftError, type ReportDraft } from './buildObservation'
import { isClockRejection } from '../clock'
import type { LocationResult } from './location'

export type SendPhase = 'locating' | 'sending'

export type SendOutcome =
  | { kind: 'invalid'; reason: DraftError }
  | { kind: 'no-location'; reason: 'denied' | 'unavailable' }
  | { kind: 'sent' }
  | { kind: 'queued' }
  | { kind: 'failed'; retryable: boolean; detail: string; /** The server refused the report's time. */ clock?: boolean }

export interface SendDeps {
  locate: () => Promise<LocationResult>
  /** Sends through the offline outbox. Without it the report goes straight to the API. */
  submit?: (body: ObservationCreate) => Promise<'sent' | 'queued'>
  create: (body: ObservationCreate) => Promise<unknown>
  /** Called when the send moves on to the next step, so the screen can show where it is. */
  onPhase?: (phase: SendPhase) => void
}

/**
 * One tap on Send report: check the draft, get the position, send.
 * The position step waits for the browser's permission prompt. It only reports
 * `no-location` when the browser has actually refused or has no position to give,
 * and a volunteer who taps Allow goes straight on to sending, with no second tap.
 */
export async function sendReport(draft: ReportDraft, deps: SendDeps): Promise<SendOutcome> {
  const invalid = validateDraft(draft)
  if (invalid) return { kind: 'invalid', reason: invalid }
  deps.onPhase?.('locating')
  const loc = await deps.locate()
  if (loc.kind !== 'ok') return { kind: 'no-location', reason: loc.kind }
  deps.onPhase?.('sending')
  try {
    const body = buildObservation(draft, loc.pos)
    if (deps.submit) return (await deps.submit(body)) === 'queued' ? { kind: 'queued' } : { kind: 'sent' }
    await deps.create(body)
    return { kind: 'sent' }
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('network', String(e), null, true)
    return {
      kind: 'failed',
      retryable: err.retryable,
      detail: Object.values(err.fields).join('; ') || err.message,
      ...(isClockRejection(err.fields) ? { clock: true } : {}),
    }
  }
}

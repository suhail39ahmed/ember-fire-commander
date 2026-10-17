import type { ChipValue, ObservationCreate, ObservationDevice } from '../contracts/types'

export interface Position {
  lat: number
  lng: number
  accuracyM: number | null
}

export interface ReportDraft {
  chip: ChipValue | null
  text: string
  capturedAt: string
  /** Battery, network and language, when the phone can say. Best effort: a report never waits on it. */
  device?: ObservationDevice
}

export type DraftError = 'empty' | 'too_long'
export const MAX_NOTE_LENGTH = 280

export function validateDraft(d: ReportDraft): DraftError | null {
  if (!d.chip && !d.text.trim()) return 'empty'
  if (d.text.length > MAX_NOTE_LENGTH) return 'too_long'
  return null
}

/**
 * Builds the POST /observations body (contract section 6.2).
 * - A chip report has source "chip"; an optional note rides along in `text`.
 * - A note without a chip has source "text" and omits the chip.
 * - lat and lng are required, so the caller must have a position.
 * - `capturedAt` comes from the draft and is not re-stamped on retry.
 * - The client never sends id or severity; ember-api sets both.
 */
export function buildObservation(d: ReportDraft, pos: Position): ObservationCreate {
  const text = d.text.trim()
  return {
    source: d.chip ? 'chip' : 'text',
    capturedAt: d.capturedAt,
    lat: pos.lat,
    lng: pos.lng,
    accuracyM: pos.accuracyM,
    chip: d.chip,
    text: text ? text : null,
    ...(d.device ? { device: d.device } : {}),
  }
}

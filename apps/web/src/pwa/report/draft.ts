import { CHIP_VALUES, type ChipValue } from '../contracts/types'
import { MAX_NOTE_LENGTH } from './buildObservation'

/**
 * The report a volunteer has started but not sent: the chip and the note, kept on this phone so a reload, a call or
 * the browser reclaiming memory does not lose them. Location and `capturedAt` are never kept; they are taken when
 * Send is pressed.
 */
export const DRAFT_KEY = 'ember.report.draft'
/** A draft older than this is dropped, so a stale "Fire" chip never greets the next shift. */
export const MAX_DRAFT_AGE_MS = 60 * 60 * 1000

export interface Draft {
  chip: ChipValue | null
  text: string
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export const isEmptyDraft = (draft: Draft): boolean => draft.chip === null && draft.text.trim() === ''

export function clearDraft(store: Store | null = defaultStore()): void {
  try {
    store?.removeItem(DRAFT_KEY)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/** Keep the draft for this volunteer. An empty draft removes the saved one. */
export function saveDraft(volunteerId: string, draft: Draft, now: Date = new Date(), store: Store | null = defaultStore()): void {
  if (isEmptyDraft(draft)) return clearDraft(store)
  try {
    store?.setItem(DRAFT_KEY, JSON.stringify({ volunteerId, chip: draft.chip, text: draft.text, savedAt: now.toISOString() }))
  } catch {
    // Storage can be unavailable (private mode); the form works without a saved draft.
  }
}

/** The saved draft, only for the same volunteer and only when it is under an hour old. */
export function loadDraft(volunteerId: string, now: Date = new Date(), store: Store | null = defaultStore()): Draft | null {
  try {
    const raw = store?.getItem(DRAFT_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Record<string, unknown>
    if (saved.volunteerId !== volunteerId || typeof saved.savedAt !== 'string') return null
    const age = now.getTime() - Date.parse(saved.savedAt)
    if (!Number.isFinite(age) || age < 0 || age > MAX_DRAFT_AGE_MS) return null
    const chip = CHIP_VALUES.find((value) => value === saved.chip) ?? null
    const text = typeof saved.text === 'string' ? saved.text.slice(0, MAX_NOTE_LENGTH + 20) : ''
    const draft = { chip, text }
    return isEmptyDraft(draft) ? null : draft
  } catch {
    return null
  }
}

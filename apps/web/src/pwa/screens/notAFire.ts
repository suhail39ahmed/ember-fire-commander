import type { ChipValue } from '../contracts/types'

/** What the volunteer saw instead of fire. The keys are shown with labels from the copy bundle. */
export const NOT_A_FIRE_REASONS = ['burning_rubbish', 'cooking_smoke', 'fog_dust', 'old_scar', 'other'] as const
export type NotAFireReason = (typeof NOT_A_FIRE_REASONS)[number]

/**
 * The words stored with the photo. They are always Bahasa Indonesia, whatever language the phone shows, so the
 * supervisor reads one wording for every volunteer. The photo observation cannot carry a chip, so the reason travels as its note.
 */
const STORED_ID: Record<NotAFireReason, string> = {
  burning_rubbish: 'Pembakaran sampah yang dijaga',
  cooking_smoke: 'Asap dapur atau tungku',
  fog_dust: 'Kabut atau debu',
  old_scar: 'Bekas bakar lama, tidak ada api',
  other: 'Lainnya',
}

export const NOTE_LIMIT = 280

export function notAFireNote(reason: NotAFireReason): string {
  return `Bukan kebakaran: ${STORED_ID[reason]}`.slice(0, NOTE_LIMIT)
}

/** Send is on only when a reason is picked and a photo with a position is ready. */
export function canSendNotAFire(reason: NotAFireReason | null, photoReady: boolean): boolean {
  return reason !== null && photoReady
}

/** "Not sure" is not a not-a-fire: it asks for another look with a smoke report. */
export const UNSURE_CHIP: ChipValue = 'asap'
export const UNSURE_TEXT = 'Tidak yakin apakah ini api. Mohon diperiksa lagi.'

import type { ChipValue } from '../contracts/types'
import type { Lang } from '../i18n'

/** Bahasa words for the chips. They match the wire values, apart from `butuh_bantuan`. */
const ID_WORD: Record<ChipValue, string> = {
  asap: 'asap',
  api: 'api',
  aman: 'aman',
  butuh_bantuan: 'butuh bantuan',
}

const EN_WORD: Record<ChipValue, string> = {
  asap: 'Smoke',
  api: 'Fire',
  aman: 'Safe',
  butuh_bantuan: 'Need help',
}

export interface ChipLabel {
  primary: string
  /** The Bahasa word, shown under the English label so crews keep the report vocabulary. */
  secondary: string | null
}

/**
 * Chip label for the current language. Only the label changes; the value sent
 * to ember-api stays `asap`, `api`, `aman` or `butuh_bantuan`.
 */
export function chipLabel(chip: ChipValue, lang: Lang): ChipLabel {
  return lang === 'en' ? { primary: EN_WORD[chip], secondary: ID_WORD[chip] } : { primary: ID_WORD[chip], secondary: null }
}

/** One-line chip label for places that cannot show two lines, such as the outbox. */
export function chipText(chip: ChipValue, lang: Lang): string {
  const { primary, secondary } = chipLabel(chip, lang)
  return secondary ? `${primary} (${secondary})` : primary
}

const EN_HINT: Record<ChipValue, string> = {
  asap: 'Smoke, no flames yet',
  api: 'I can see flames',
  aman: 'No fire here, or it is out',
  butuh_bantuan: 'I need help right now',
}

const ID_HINT: Record<ChipValue, string> = {
  asap: 'Asap, belum ada api',
  api: 'Saya melihat api',
  aman: 'Tidak ada api di sini, atau sudah padam',
  butuh_bantuan: 'Saya butuh bantuan sekarang',
}

/** The one-line description under a chip label on the Report tab. */
export function chipHint(chip: ChipValue, lang: Lang): string {
  return lang === 'en' ? EN_HINT[chip] : ID_HINT[chip]
}

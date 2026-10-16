import type { Observation } from '../contracts/types'
import { t, type Lang } from '../i18n'
import { chipText } from '../report/chips'
import { screenStrings } from './strings'

/** The line a report shows: its note, else its chip label, else its severity. */
export function reportTitle(observation: Observation, lang: Lang): string {
  const note = observation.text?.trim()
  if (note) return note
  if (observation.chip) return chipText(observation.chip, lang)
  return t(lang, screenStrings.severity[observation.severity])
}

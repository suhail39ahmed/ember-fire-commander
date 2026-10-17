import { ApiError } from '../../pwa/api/types'
import { t, type Lang } from '../../pwa/i18n'
import type { AskAnswer, DetailSuggestions, Translation } from '../contracts'
import { assistCopy, languageNames } from './assistCopy'

export const ASK_MAX = 500

/** What the incident detail screen can ask of the model-written help. Each call is advisory and writes no decision. */
export interface AssistActions {
  /** POST /incidents/{id}/suggestions, then a fresh read. */
  suggest(): Promise<DetailSuggestions>
  /** POST /incidents/{id}/ask. */
  ask(question: string, volunteerId?: string): Promise<AskAnswer>
  /** POST /incidents/{id}/observations/{observationId}/translate, then a fresh read. */
  translate(observationId: string): Promise<Translation>
}

/** One plain sentence for a failed call. Nothing was stored in any of these cases. */
export function assistProblem(lang: Lang, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return t(lang, assistCopy.errSession)
    if (error.status === 404) return t(lang, assistCopy.errGone)
    if (error.status === 400) return t(lang, assistCopy.errInvalid)
    if (error.status === null) return t(lang, assistCopy.errNetwork)
  }
  return t(lang, assistCopy.errUnavailable)
}

/** "Indonesian", "Inggris", or the raw code. Null when no language was stored. */
export function languageName(lang: Lang, code: string | null): string | null {
  if (!code) return null
  const known = languageNames[code]
  return known ? t(lang, known) : code
}

/** Show a translation only when it says something the original does not: not for a report that is already English. */
export function worthShowing(translation: Translation | undefined): translation is Translation {
  return Boolean(translation && translation.sourceLanguage !== 'en')
}

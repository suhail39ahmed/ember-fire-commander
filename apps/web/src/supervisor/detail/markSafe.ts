import type { Lang } from '../../pwa/i18n'
import { t } from '../../pwa/i18n'
import type { IncidentDecision } from '../contracts'
import { stateCopy, safeFailureOf, safeFailureText, type SafeFailure } from './withdrawStateCopy'

export type SafeResult =
  | { ok: true; auditId: string; text: string }
  | { ok: false; failure: SafeFailure; text: string }

/** Mark one volunteer found safe and say what happened in the supervisor's language. Never throws. */
export async function submitSafe(
  send: (volunteerId: string) => Promise<IncidentDecision>,
  volunteerId: string,
  name: string,
  lang: Lang,
): Promise<SafeResult> {
  try {
    const { auditId } = await send(volunteerId)
    return { ok: true, auditId, text: `${name} ${t(lang, stateCopy.markedSafe)} · ${t(lang, stateCopy.logged)} ${auditId}` }
  } catch (error) {
    return { ok: false, failure: safeFailureOf(error), text: safeFailureText(error, lang) }
  }
}

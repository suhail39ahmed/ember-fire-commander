/**
 * Lower severity rules for the console. The route enforces them (a value that is not
 * strictly lower is 409, `unknown` is 400, and only code raises severity). These
 * helpers keep the dialog from offering anything the route would refuse.
 */
import { t, type Lang } from '../../pwa/i18n'
import { ApiError } from '../../pwa/api/types'
import type { IncidentDecision, LowerableSeverity, Severity } from '../contracts'
import { severityCopy } from './severityCopy'

/**
 * The scale from the shared contract (sections 4 and 6.5), lowest first. `ember-api` does
 * not return the allowed values yet, so this is the one place the console reads the scale
 * from. Replace it with the API list when the incident read carries one.
 */
export const SEVERITY_SCALE: readonly LowerableSeverity[] = ['none', 'smoke', 'small_flame', 'large_flame']

/** Values strictly lower than `current`, nearest first. Nothing lowers `none` or `unknown`. */
export function lowerChoices(current: Severity): LowerableSeverity[] {
  const at = SEVERITY_SCALE.indexOf(current as LowerableSeverity)
  if (at <= 0) return []
  return SEVERITY_SCALE.slice(0, at).reverse()
}

/** The value selected when the dialog opens: the nearest lower one. */
export function defaultChoice(current: Severity): LowerableSeverity | null {
  return lowerChoices(current)[0] ?? null
}

export function isAllowed(current: Severity, chosen: Severity): chosen is LowerableSeverity {
  return (lowerChoices(current) as Severity[]).includes(chosen)
}

/** A refusal in the supervisor's language. Never a status code, exception name, or server text. */
export function failureMessage(error: unknown, lang: Lang): string {
  if (error instanceof ApiError) {
    if (error.code === 'network') return t(lang, severityCopy.errNetwork)
    if (error.status === 409) return t(lang, severityCopy.errNotLower)
    if (error.status === 400) return t(lang, severityCopy.errRefused)
    if (error.status === 401 || error.status === 403) return t(lang, severityCopy.errSession)
    if (error.status === 404) return t(lang, severityCopy.errGone)
  }
  return t(lang, severityCopy.errServer)
}

export type LowerResult = { ok: true; auditId: string; severity: LowerableSeverity } | { ok: false; message: string }

/**
 * The only place the dialog writes. A value that is the current one, a higher one, or
 * `unknown` never reaches the route. Cancel and closing never reach this at all.
 */
export async function submitLower(
  send: (severity: LowerableSeverity) => Promise<IncidentDecision>,
  current: Severity,
  chosen: Severity | null,
  lang: Lang,
): Promise<LowerResult> {
  if (chosen === null || !isAllowed(current, chosen)) return { ok: false, message: t(lang, severityCopy.errRefused) }
  try {
    const result = await send(chosen)
    return { ok: true, auditId: result.auditId, severity: chosen }
  } catch (error) {
    return { ok: false, message: failureMessage(error, lang) }
  }
}

export function loweredText(lang: Lang, severityLabel: string, actor: string, auditId: string, withdrawActive: boolean): string {
  const by = actor ? ` ${t(lang, severityCopy.doneBy)} ${actor}` : ''
  const stay = withdrawActive ? ` ${t(lang, severityCopy.withdrawNote)}` : ''
  return `${t(lang, severityCopy.done)} ${severityLabel}${by} · ${t(lang, severityCopy.audit)} ${auditId}.${stay}`
}

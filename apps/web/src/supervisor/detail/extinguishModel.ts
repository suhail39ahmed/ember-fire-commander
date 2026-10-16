/**
 * Mark extinguished for the console. The route decides what is allowed (any status but
 * `extinguished`). Nothing here reopens, re-rates or re-checks the incident.
 */
import { formatTimeZone } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import { ApiError } from '../../pwa/api/types'
import type { IncidentDecision } from '../contracts'
import { extinguishCopy } from './extinguishCopy'

/** True when the refusal means the incident is already out, so the dialog can say so plainly. */
export function isAlreadyOut(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}

/** A refusal in the supervisor's language. Never a status code, exception name, or server text. */
export function failureMessage(error: unknown, lang: Lang): string {
  if (isAlreadyOut(error)) return t(lang, extinguishCopy.alreadyOut)
  if (error instanceof ApiError) {
    if (error.code === 'network') return t(lang, extinguishCopy.errNetwork)
    if (error.status === 401 || error.status === 403) return t(lang, extinguishCopy.errSession)
    if (error.status === 404) return t(lang, extinguishCopy.errGone)
  }
  return t(lang, extinguishCopy.errServer)
}

export type ExtinguishResult = { ok: true; auditId: string } | { ok: false; message: string; alreadyOut: boolean }

/** The only place the dialog writes. Cancel and closing never reach it. */
export async function submitExtinguish(send: () => Promise<IncidentDecision>, lang: Lang): Promise<ExtinguishResult> {
  try {
    const result = await send()
    return { ok: true, auditId: result.auditId }
  } catch (error) {
    return { ok: false, message: failureMessage(error, lang), alreadyOut: isAlreadyOut(error) }
  }
}

/** "Marked extinguished by Bu Maya at 14:12 · audit aud_…". `atMs` is the server-aligned clock. */
export function doneText(lang: Lang, actor: string, atMs: number, auditId: string): string {
  const head = actor ? `${t(lang, extinguishCopy.done)} ${actor}` : t(lang, extinguishCopy.doneAnon)
  return `${head} ${t(lang, extinguishCopy.at)} ${formatTimeZone(atMs)} · ${t(lang, extinguishCopy.audit)} ${auditId}.`
}

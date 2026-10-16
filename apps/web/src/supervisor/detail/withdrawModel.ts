/**
 * Send WITHDRAW rules for the console. The route decides what is valid; these helpers
 * only keep an obviously invalid request from being sent and explain a refusal in words.
 */
import { formatTime } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import { ApiError } from '../../pwa/api/types'
import type { IncidentDecision, WithdrawRequest } from '../contracts'
import { taskCopy, taskStatusName } from './copy'
import { volunteerLabel, type VolunteerRow } from './model'
import { DEFAULT_WITHDRAW, withdrawCopy } from './withdrawCopy'

/** Saved on the incident and the audit trail. A wire value, not translated. */
export const WITHDRAW_REASON = 'supervisor instruction'
export const INSTRUCTION_MAX = 500

/** Both languages in the one string the route stores, so a volunteer reads it in either. */
export function defaultInstruction(): string {
  return `${DEFAULT_WITHDRAW.id} / ${DEFAULT_WITHDRAW.en}`
}

/** Volunteers who have reported are selected first. If nobody has, everyone on the incident is. */
export function initialSelection(rows: VolunteerRow[]): string[] {
  const reported = rows.filter((r) => r.reportCount > 0).map((r) => r.id)
  return reported.length > 0 ? reported : rows.map((r) => r.id)
}

export function toggleSelection(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
}

export type FormProblem = 'none_selected' | 'blank' | 'too_long'

export function formProblem(selected: string[], instruction: string): FormProblem | null {
  if (selected.length === 0) return 'none_selected'
  const text = instruction.trim()
  if (!text) return 'blank'
  if (text.length > INSTRUCTION_MAX) return 'too_long'
  return null
}

export function problemText(problem: FormProblem, lang: Lang): string {
  return t(lang, problem === 'none_selected' ? withdrawCopy.noneSelected : problem === 'blank' ? withdrawCopy.blank : withdrawCopy.tooLong)
}

/** The request for the route: recipients in the order they are listed, one instruction, the saved reason. */
export function buildRequest(rows: VolunteerRow[], selected: string[], instruction: string): WithdrawRequest {
  const chosen = new Set(selected)
  return {
    volunteerIds: rows.filter((r) => chosen.has(r.id)).map((r) => r.id),
    instruction: instruction.trim(),
    reasons: [WITHDRAW_REASON],
  }
}

/** "2 reports · 14:06", or the volunteer's task when they have not reported. */
export function recipientDetail(row: VolunteerRow, lang: Lang): string {
  if (row.latest) {
    const word = t(lang, row.reportCount === 1 ? withdrawCopy.reportsOne : withdrawCopy.reportsMany)
    return `${row.reportCount} ${word} · ${formatTime(row.latest.capturedAt)}`
  }
  if (row.task && row.task.type !== 'withdraw') {
    return `${t(lang, taskCopy.type[row.task.type])} ${t(lang, withdrawCopy.taskOnly)} · ${t(lang, taskStatusName[row.task.status])}`
  }
  return t(lang, withdrawCopy.alreadyWithdrawn)
}

export function recipientName(row: VolunteerRow, lang: Lang): string {
  return volunteerLabel(row.id, lang)
}

/** A refusal in the supervisor's language. Never a status code, exception name, or server text. */
export function failureMessage(error: unknown, lang: Lang): string {
  if (error instanceof ApiError) {
    if (error.code === 'network') return t(lang, withdrawCopy.errNetwork)
    if (error.status === 400) {
      return error.fields.volunteerIds ? t(lang, withdrawCopy.errUnknownVolunteer) : t(lang, withdrawCopy.errInstruction)
    }
    if (error.status === 401 || error.status === 403) return t(lang, withdrawCopy.errSession)
    if (error.status === 404) return t(lang, withdrawCopy.errGone)
  }
  return t(lang, withdrawCopy.errServer)
}

export type SubmitResult = { ok: true; auditId: string; count: number } | { ok: false; message: string }

/**
 * The only place the dialog writes. Cancel and closing never reach it. A refusal is
 * returned as text for the dialog to show inline; the incident is untouched.
 */
export async function submitWithdraw(
  send: (request: WithdrawRequest) => Promise<IncidentDecision>,
  request: WithdrawRequest,
  lang: Lang,
): Promise<SubmitResult> {
  try {
    const result = await send(request)
    return { ok: true, auditId: result.auditId, count: request.volunteerIds.length }
  } catch (error) {
    return { ok: false, message: failureMessage(error, lang) }
  }
}

export function sentText(lang: Lang, count: number, auditId: string): string {
  const head = count === 1
    ? t(lang, withdrawCopy.sentOne)
    : `${t(lang, withdrawCopy.sentMany)} ${count} ${t(lang, withdrawCopy.sentManyUnit)}`
  return `${head} · ${t(lang, withdrawCopy.audit)} ${auditId}`
}

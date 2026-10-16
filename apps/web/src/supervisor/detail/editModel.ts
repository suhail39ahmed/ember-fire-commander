/**
 * Edit instruction rules for the console. The route decides what is valid (not blank, 500
 * characters, never a WITHDRAW task); these helpers keep an obviously invalid request from
 * being sent, and explain a refusal in words. A refusal never replaces the text on screen.
 */
import { t, type Lang } from '../../pwa/i18n'
import { ApiError } from '../../pwa/api/types'
import type { TaskDecision, Task } from '../contracts'
import { editCopy } from './editCopy'

export const EDIT_MAX = 500

export type EditProblem = 'blank' | 'too_long' | 'unchanged'

/** What is wrong with the text, if anything. Counts the trimmed text, as the route does. */
export function editProblem(draft: string, current: string | null): EditProblem | null {
  const text = draft.trim()
  if (!text) return 'blank'
  if (text.length > EDIT_MAX) return 'too_long'
  if (text === (current ?? '').trim()) return 'unchanged'
  return null
}

export function problemText(problem: EditProblem, lang: Lang): string {
  return t(lang, problem === 'blank' ? editCopy.blank : problem === 'too_long' ? editCopy.tooLong : editCopy.unchanged)
}

/** A refusal in the supervisor's language. Never a status code, exception name, or server text. */
export function failureMessage(error: unknown, task: Pick<Task, 'type'>, lang: Lang): string {
  if (error instanceof ApiError) {
    if (error.code === 'network') return t(lang, editCopy.errNetwork)
    if (error.status === 409) return t(lang, task.type === 'withdraw' ? editCopy.errWithdraw : editCopy.errRefused)
    if (error.status === 400) return t(lang, editCopy.errInvalid)
    if (error.status === 401 || error.status === 403) return t(lang, editCopy.errSession)
    if (error.status === 404) return t(lang, editCopy.errGone)
  }
  return t(lang, editCopy.errServer)
}

export type EditResult = { ok: true; auditId: string; editor: string } | { ok: false; message: string }

/**
 * The only place the dialog writes. A blank or over-long text never reaches the route, and a WITHDRAW
 * task is never sent at all. Cancel and closing never call this.
 */
export async function submitEdit(
  send: (instruction: string) => Promise<TaskDecision>,
  task: Task,
  draft: string,
  fallbackEditor: string,
  lang: Lang,
): Promise<EditResult> {
  const problem = editProblem(draft, task.instruction)
  if (problem === 'blank' || problem === 'too_long') return { ok: false, message: problemText(problem, lang) }
  if (task.type === 'withdraw') return { ok: false, message: t(lang, editCopy.errWithdraw) }
  try {
    const result = await send(draft.trim())
    return { ok: true, auditId: result.auditId, editor: result.editedBy ?? fallbackEditor }
  } catch (error) {
    return { ok: false, message: failureMessage(error, task, lang) }
  }
}

export function savedText(lang: Lang, editor: string, auditId: string): string {
  const by = editor ? ` ${t(lang, editCopy.by)} ${editor}` : ''
  return `${t(lang, editCopy.saved)}${by} · ${t(lang, editCopy.audit)} ${auditId}`
}

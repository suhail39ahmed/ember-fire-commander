/**
 * What the incident shows about delivery, read from the task records: when each instruction was sent, when
 * the volunteer's app said it was heard, and when a resend opens. The countdown uses the `resendAt` the API
 * computes, never a number of the console's own.
 */
import type { Lang } from '../../pwa/i18n'
import { t } from '../../pwa/i18n'
import type { Task } from '../contracts'
import { deliveryCopy, resendFailureText } from './deliveryCopy'

export type Receipt =
  /** Never sent (proposed or rejected), or sent before receipts existed. */
  | { state: 'none' }
  | { state: 'heard'; heardAt: string }
  /** Sent, not heard, `resendIn` seconds until a resend opens (null when the API sent no time). */
  | { state: 'waiting'; sentAt: string; resendIn: number | null }
  /** Sent, not heard, and a resend is open now. */
  | { state: 'overdue'; sentAt: string }

export function receiptOf(task: Task | null, nowMs: number): Receipt {
  if (!task || task.status !== 'approved') return { state: 'none' }
  if (task.heardAt) return { state: 'heard', heardAt: task.heardAt }
  if (!task.sentAt) return { state: 'none' }
  const opens = task.resendAt ? Date.parse(task.resendAt) : NaN
  if (Number.isNaN(opens)) return { state: 'waiting', sentAt: task.sentAt, resendIn: null }
  const left = Math.ceil((opens - nowMs) / 1000)
  return left > 0 ? { state: 'waiting', sentAt: task.sentAt, resendIn: left } : { state: 'overdue', sentAt: task.sentAt }
}

/** m:ss, so 40 seconds reads 0:40. */
export function countdownText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** True while some instruction is waiting to be heard, so the screen needs a clock. */
export function needsClock(tasks: Task[], nowMs: number): boolean {
  return tasks.some((task) => receiptOf(task, nowMs).state === 'waiting')
}

export interface HeardEvent {
  taskId: string
  volunteerId: string
  heardAt: string
  text: string
}

/** Tasks that were not heard in the last read and are now. The first read of an incident reports nothing. */
export function heardEvents(before: Task[] | null, after: Task[]): HeardEvent[] {
  if (before === null) return []
  const was = new Map(before.map((task) => [task.id, Boolean(task.heardAt)]))
  return after
    .filter((task) => task.heardAt && was.get(task.id) === false)
    .map((task) => ({ taskId: task.id, volunteerId: task.volunteerId, heardAt: task.heardAt as string, text: task.instruction ?? '' }))
    .sort((a, b) => Date.parse(a.heardAt) - Date.parse(b.heardAt))
}

export type ResendResult = { ok: true; text: string } | { ok: false; text: string }

/** Resend one instruction and say what happened in the supervisor's language. Never throws. */
export async function submitResend(send: (taskId: string) => Promise<{ auditId: string }>, taskId: string, lang: Lang): Promise<ResendResult> {
  try {
    const result = await send(taskId)
    return { ok: true, text: `${t(lang, deliveryCopy.resent)} · ${t(lang, deliveryCopy.audit)} ${result.auditId}` }
  } catch (error) {
    return { ok: false, text: resendFailureText(error, lang) }
  }
}

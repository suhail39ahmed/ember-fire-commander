/**
 * Send one instruction to one volunteer. The route decides what is valid; these helpers only keep an obviously
 * empty or oversized request from being sent, say when sending is refused before a request is made, and explain
 * a refusal in words. A free instruction can never hold or replace a WITHDRAW, so a volunteer under an active
 * withdraw who is not marked safe is never offered a send.
 */
import { t, type Lang } from '../../pwa/i18n'
import { ApiError } from '../../pwa/api/types'
import type { IncidentDetail, TaskDecision } from '../contracts'
import { instructionCopy } from './instructionCopy'
import { INSTRUCTION_MAX } from './withdrawModel'

export type SendBlock = 'offline' | 'extinguished' | 'withdraw'

/** Why a send cannot be offered right now, or null when it can. */
export function sendBlock(detail: IncidentDetail, volunteerId: string, offline: boolean): SendBlock | null {
  if (offline) return 'offline'
  if (detail.incident.status === 'extinguished') return 'extinguished'
  const w = detail.incident.withdraw
  if (w?.active && w.volunteerIds.includes(volunteerId) && !(w.safeVolunteerIds ?? []).includes(volunteerId)) return 'withdraw'
  return null
}

export type InstructionProblem = 'blank' | 'too_long'

export function instructionProblem(text: string): InstructionProblem | null {
  const trimmed = text.trim()
  if (!trimmed) return 'blank'
  return trimmed.length > INSTRUCTION_MAX ? 'too_long' : null
}

/** A refusal in the supervisor's language. Never a status code, exception name, or server text. */
export function instructionFailure(error: unknown, lang: Lang): string {
  if (error instanceof ApiError) {
    if (error.code === 'network') return t(lang, instructionCopy.errNetwork)
    if (error.status === 400) return t(lang, instructionCopy.errInvalid)
    if (error.status === 401 || error.status === 403) return t(lang, instructionCopy.errSession)
    if (error.status === 404) return t(lang, instructionCopy.errGone)
    if (error.status === 409) return t(lang, instructionCopy.errRefused)
  }
  return t(lang, instructionCopy.errServer)
}

export type InstructionResult = { ok: true; auditId: string; text: string } | { ok: false; text: string }

/** Send one instruction and say what happened. Never throws. A blank or oversized text is refused without a request. */
export async function submitInstruction(
  send: (instruction: string) => Promise<TaskDecision>,
  text: string,
  name: string,
  lang: Lang,
): Promise<InstructionResult> {
  const problem = instructionProblem(text)
  if (problem) return { ok: false, text: t(lang, instructionCopy.problem[problem]) }
  try {
    const { auditId } = await send(text.trim())
    return { ok: true, auditId, text: `${t(lang, instructionCopy.sentTo)} ${name} · ${t(lang, instructionCopy.logged)} ${auditId}` }
  } catch (error) {
    return { ok: false, text: instructionFailure(error, lang) }
  }
}

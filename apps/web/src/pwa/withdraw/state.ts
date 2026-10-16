import type { Digest, Task, Withdraw } from '../contracts/types'

/** How long the phone shows the first WITHDRAW screen before it asks "Are you upwind and safe?". */
export const CONFIRM_AFTER_MS = 30_000
/** While the volunteer is asked and has not answered, the phone repeats the alarm this often. */
export const REMIND_EVERY_MS = 15_000
/** While "I can't get out" is on, the phone sends its position again this often. */
export const SHARE_EVERY_MS = 10_000

export type AnswerState = 'safe' | 'stuck'
export type WithdrawStep = 'cover' | 'confirm' | 'safe' | 'stuck'

export interface ActiveWithdraw {
  incidentId: string
  /** Null when only a withdraw task (no incident.withdraw) reached the phone. */
  withdraw: Withdraw | null
  instruction: string | null
}

/**
 * The WITHDRAW that applies to this volunteer: an active `incident.withdraw` that lists them, else an approved
 * `withdraw` task. Nothing here is computed; every field is the backend's.
 */
export function findWithdraw(digest: Digest | null, volunteerId: string | null, task: Task | null): ActiveWithdraw | null {
  if (digest && volunteerId) {
    for (const incident of digest.incidents) {
      const w = incident.withdraw
      if (w?.active && w.volunteerIds.includes(volunteerId)) return { incidentId: incident.id, withdraw: w, instruction: w.instruction }
    }
  }
  if (task?.type === 'withdraw') return { incidentId: task.incidentId, withdraw: null, instruction: task.instruction }
  return null
}

/** One id per withdraw order, so an answer given to an earlier order is not reused for a later one. */
export function withdrawKey(active: ActiveWithdraw): string {
  return `${active.incidentId}@${active.withdraw?.sentAt ?? 'unsent'}`
}

export function stepOf(input: { answer: AnswerState | null; supervisorSafe: boolean; shownAtMs: number; nowMs: number }): WithdrawStep {
  if (input.answer === 'stuck') return 'stuck'
  if (input.answer === 'safe' || input.supervisorSafe) return 'safe'
  return input.nowMs - input.shownAtMs >= CONFIRM_AFTER_MS ? 'confirm' : 'cover'
}

/** Seconds are not shown to the volunteer; this is how many other volunteers got the same order. */
export function othersCount(w: Withdraw | null, volunteerId: string | null): number {
  if (!w) return 0
  return w.volunteerIds.filter((id) => id !== volunteerId).length
}

export interface ShownWithdraw {
  key: string
  incidentId: string
  sentAt: string | null
  source: 'code' | 'supervisor' | null
  reasons: string[]
  instruction: string | null
  /** When this phone first showed it (ms since epoch). */
  shownAtMs: number
  /** When this phone first saw the order gone from the digest. Absent while the order is still on. */
  clearedAtMs?: number
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const ANSWER = 'ember.withdraw.answer'
const SHOWN = 'ember.withdraw.shown'

function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * What this phone remembers about a WITHDRAW across a reload: the volunteer's answer, and the order that was on
 * screen (so that when the order stops being in the digest the phone can say it was lifted). Storage that is
 * missing or full only means the phone forgets; nothing here is sent.
 */
export class WithdrawMemory {
  constructor(private readonly store: Store | null = defaultStore()) {}

  answer(key: string): { state: AnswerState; at: string } | null {
    const raw = this.read(ANSWER)
    if (!raw || raw.key !== key || typeof raw.at !== 'string') return null
    return raw.state === 'safe' || raw.state === 'stuck' ? { state: raw.state, at: raw.at } : null
  }

  saveAnswer(key: string, state: AnswerState, at: string): void {
    this.write(ANSWER, { key, state, at })
  }

  shown(): ShownWithdraw | null {
    const raw = this.read(SHOWN)
    if (!raw || typeof raw.key !== 'string' || typeof raw.incidentId !== 'string' || typeof raw.shownAtMs !== 'number' || !Array.isArray(raw.reasons)) return null
    return {
      key: raw.key,
      incidentId: raw.incidentId,
      sentAt: typeof raw.sentAt === 'string' ? raw.sentAt : null,
      source: raw.source === 'code' || raw.source === 'supervisor' ? raw.source : null,
      reasons: raw.reasons.filter((r: unknown): r is string => typeof r === 'string'),
      instruction: typeof raw.instruction === 'string' ? raw.instruction : null,
      shownAtMs: raw.shownAtMs,
      ...(typeof raw.clearedAtMs === 'number' ? { clearedAtMs: raw.clearedAtMs } : {}),
    }
  }

  saveShown(shown: ShownWithdraw): void {
    this.write(SHOWN, shown)
  }

  clearShown(): void {
    try {
      this.store?.removeItem(SHOWN)
    } catch {
      /* the phone forgets */
    }
  }

  private read(name: string): Record<string, unknown> | null {
    try {
      const text = this.store?.getItem(name)
      const value = text ? JSON.parse(text) : null
      return value && typeof value === 'object' ? value : null
    } catch {
      return null
    }
  }

  private write(name: string, value: unknown): void {
    try {
      this.store?.setItem(name, JSON.stringify(value))
    } catch {
      /* the phone forgets */
    }
  }
}

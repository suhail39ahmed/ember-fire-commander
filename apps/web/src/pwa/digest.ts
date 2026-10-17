import type { Digest, Task, Withdraw } from './contracts/types'

/**
 * The volunteer's current task, using the rule from contract section 7.1
 * (get_my_task): the newest approved task, with a withdraw task preferred.
 * The digest lists tasks oldest first, so "newest" is the last match.
 */
export function currentTask(digest: Digest | null): Task | null {
  if (!digest) return null
  // A closed verify check is thank-you only (#140), not an open instruction.
  const approved = digest.myTasks.filter((t) => t.status === 'approved' && !t.closedAt)
  const withdraw = approved.filter((t) => t.type === 'withdraw')
  return withdraw[withdraw.length - 1] ?? approved[approved.length - 1] ?? null
}

/** Newest personalized task closure the volunteer has not dismissed yet (#140). */
export function closedThankYouTask(digest: Digest | null, seenIds: ReadonlySet<string>): Task | null {
  if (!digest) return null
  const closed = digest.myTasks
    .filter((t) => t.closedAt && t.closeMessage?.trim() && !seenIds.has(t.id))
    .sort((a, b) => Date.parse(a.closedAt ?? '') - Date.parse(b.closedAt ?? ''))
  return closed[closed.length - 1] ?? null
}

/** An active withdraw instruction that names this volunteer, if any. */
export function activeWithdraw(digest: Digest | null, volunteerId: string | null): Withdraw | null {
  if (!digest || !volunteerId) return null
  for (const incident of digest.incidents) {
    const w = incident.withdraw
    if (w?.active && w.volunteerIds.includes(volunteerId)) return w
  }
  return null
}

import type { Digest } from './contracts/types'

/**
 * The tasks this phone is showing right now that the server has not heard about yet: the current task, and
 * while the withdraw screen is up, every sent withdraw task (they carry the one instruction on screen).
 * A task only counts once it is sent (`approved`), and one already heard is left alone.
 */
export function tasksToMarkHeard(digest: Digest | null, currentTaskId: string | null, withdrawOnScreen: boolean): string[] {
  if (!digest) return []
  const shown = digest.myTasks.filter(
    (t) => t.status === 'approved' && !t.heardAt && (t.id === currentTaskId || (withdrawOnScreen && t.type === 'withdraw')),
  )
  return shown.map((t) => t.id)
}

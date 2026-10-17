/** Local dismiss list for lead-closed thank-you screens (#140). */
const KEY = 'ember.pwa.seenClosed'

export function loadSeenClosed(store: Pick<Storage, 'getItem'> | null = defaultStore()): Set<string> {
  if (!store) return new Set()
  try {
    const raw = store.getItem(KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

export function markSeenClosed(taskId: string, store: Pick<Storage, 'getItem' | 'setItem'> | null = defaultStore()): void {
  if (!store) return
  const next = loadSeenClosed(store)
  next.add(taskId)
  store.setItem(KEY, JSON.stringify([...next]))
}

function defaultStore(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

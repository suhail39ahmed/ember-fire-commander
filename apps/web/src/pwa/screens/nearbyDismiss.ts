/**
 * "Not now" for a nearby-fire prompt (#134). Kept on this phone so a digest poll does not bring
 * the same incident back after the volunteer dismissed it.
 */
const keyOf = (volunteerId: string) => `ember.nearbyDismissed.${volunteerId}`

function readIds(volunteerId: string): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(keyOf(volunteerId))
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function isNearbyDismissed(volunteerId: string | null | undefined, incidentId: string): boolean {
  if (!volunteerId) return false
  return readIds(volunteerId).includes(incidentId)
}

export function dismissNearby(volunteerId: string | null | undefined, incidentId: string): void {
  if (!volunteerId || typeof localStorage === 'undefined') return
  const next = Array.from(new Set([...readIds(volunteerId), incidentId]))
  localStorage.setItem(keyOf(volunteerId), JSON.stringify(next))
}

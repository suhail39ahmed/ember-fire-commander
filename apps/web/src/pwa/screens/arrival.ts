import { bearingDeg, compassOf, distanceM, type Compass, type LatLng } from './geo'

/**
 * How close the phone must be to the spot before "I'm there" turns on. The design does not give a number, so this is a
 * single named setting, not a figure read from the API. Change it here.
 */
export const ARRIVAL_RADIUS_M = 100

/** What the phone knows about its own position. `waiting` lasts until the first fix or an answer. */
export type DevicePosition =
  | { kind: 'waiting' }
  | { kind: 'ok'; lat: number; lng: number; accuracyM: number }
  | { kind: 'denied' }
  | { kind: 'unavailable' }

export type Arrival =
  | { kind: 'waiting' | 'denied' | 'unavailable' }
  | { kind: 'far' | 'there'; distanceM: number; bearing: number; compass: Compass }

/** Where this phone is relative to the spot the task points at. Distance and bearing are computed here from the GPS fix. */
export function arrivalOf(position: DevicePosition, target: LatLng | null, radiusM: number = ARRIVAL_RADIUS_M): Arrival {
  if (position.kind !== 'ok') return { kind: position.kind }
  if (!target) return { kind: 'unavailable' }
  const distance = distanceM(position, target)
  const bearing = bearingDeg(position, target)
  return { kind: distance <= radiusM ? 'there' : 'far', distanceM: distance, bearing, compass: compassOf(bearing) }
}

/** Instructions from a supervisor (and anything that is not a spot to reach) are answered with Doing it or Can't do it. */
export function isSpotTask(type: string): boolean {
  return type === 'verify' || type === 'investigate'
}

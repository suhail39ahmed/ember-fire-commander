import type { ObservationJoin, SentReport } from '../contracts/types'
import { incidentLabel } from '../incidentName'

/** Where a report went, as the phone shows it (#131, #132). The numbers are ember-api's, from the join agents recorded. */
export interface JoinResult {
  incidentId: string
  label: string
  /** True when it joined an incident another report had opened, false when it started one. */
  joined: boolean
  /** Other reports, from other volunteers, within `radiusM` when this one arrived. 0 means it started the incident. */
  nearbyCount: number
  /** Metres to the nearest of them, or null when there were none. */
  nearestM: number | null
  /** The join radius in metres. */
  radiusM: number
}

/** The join agents recorded, worded for the phone. The label never carries an id. */
export function joinResultOf(join: ObservationJoin, lang: 'id' | 'en'): JoinResult {
  return {
    incidentId: join.incidentId,
    label: incidentLabel({ id: join.incidentId, name: join.incidentName, area: join.incidentArea }, lang),
    joined: join.joined,
    nearbyCount: join.nearbyCount,
    nearestM: join.nearestM,
    radiusM: join.radiusM,
  }
}

const sameInstant = (a: string, b: string) => {
  const x = Date.parse(a)
  return Number.isFinite(x) && x === Date.parse(b)
}

/**
 * This phone's own report in the digest's `sentToday`, by the `capturedAt` it stamped. The outbox keeps no create
 * response, so the stamp is the only thing the phone and ember-api share. Two reports in the same millisecond cannot
 * happen from one phone.
 */
export function findSent(list: SentReport[] | undefined, capturedAt: string): SentReport | null {
  return list?.find((row) => sameInstant(row.capturedAt, capturedAt)) ?? null
}

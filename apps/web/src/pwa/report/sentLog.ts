import { CHIP_VALUES, type ChipValue } from '../contracts/types'
import type { JoinResult } from './joinResult'

/**
 * What this phone sent today, kept on the phone so the success card can list "Sent today" (#131). It is the phone's own
 * record, and it is what a report waiting in the outbox shows before ember-api has it. Once ember-api lists the report
 * (the digest's `sentToday`, matched by `capturedAt`), the list shows ember-api's row instead (see sentRows.ts). Only
 * the volunteer who sent them sees them.
 */
export const SENT_KEY = 'ember.report.sentToday'
const MAX_ENTRIES = 20

export interface SentEntry {
  /** When it was sent (ISO). Also the entry's identity. */
  at: string
  /** The `capturedAt` stamped on the report, which is how ember-api's list is matched to it. Null on an entry saved before #131. */
  capturedAt: string | null
  kind: 'sent' | 'queued'
  chip: ChipValue | null
  text: string
  accuracyM: number | null
  /** Where agents placed it, once known. */
  join: JoinResult | null
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

function parseJoin(raw: unknown): JoinResult | null {
  if (!raw || typeof raw !== 'object') return null
  const j = raw as Record<string, unknown>
  if (typeof j.incidentId !== 'string' || typeof j.label !== 'string' || typeof j.joined !== 'boolean') return null
  if (typeof j.nearbyCount !== 'number' || typeof j.radiusM !== 'number') return null
  return { incidentId: j.incidentId, label: j.label, joined: j.joined, nearbyCount: j.nearbyCount, nearestM: typeof j.nearestM === 'number' ? j.nearestM : null, radiusM: j.radiusM }
}

function parse(raw: unknown): SentEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.at !== 'string' || !Number.isFinite(Date.parse(r.at))) return null
  return {
    at: r.at,
    kind: r.kind === 'queued' ? 'queued' : 'sent',
    chip: CHIP_VALUES.find((c) => c === r.chip) ?? null,
    text: typeof r.text === 'string' ? r.text : '',
    accuracyM: typeof r.accuracyM === 'number' ? r.accuracyM : null,
    capturedAt: typeof r.capturedAt === 'string' && Number.isFinite(Date.parse(r.capturedAt)) ? r.capturedAt : null,
    join: parseJoin(r.join),
  }
}

/** Today's entries for this volunteer, oldest first. Anything from another day or volunteer is ignored. */
export function loadSentToday(volunteerId: string, now: Date = new Date(), store: Store | null = defaultStore()): SentEntry[] {
  try {
    const raw = store?.getItem(SENT_KEY)
    if (!raw) return []
    const saved = JSON.parse(raw) as { volunteerId?: unknown; entries?: unknown }
    if (saved.volunteerId !== volunteerId || !Array.isArray(saved.entries)) return []
    return saved.entries.map(parse).filter((e): e is SentEntry => e !== null && sameDay(new Date(e.at), now))
  } catch {
    return []
  }
}

function write(volunteerId: string, entries: SentEntry[], store: Store | null): void {
  try {
    store?.setItem(SENT_KEY, JSON.stringify({ volunteerId, entries: entries.slice(-MAX_ENTRIES) }))
  } catch {
    // Storage can be unavailable; the card works without the list.
  }
}

export function addSent(volunteerId: string, entry: SentEntry, now: Date = new Date(), store: Store | null = defaultStore()): SentEntry[] {
  const entries = [...loadSentToday(volunteerId, now, store).filter((e) => e.at !== entry.at), entry]
  write(volunteerId, entries, store)
  return entries.slice(-MAX_ENTRIES)
}

/** Fill in what became known later, such as the incident a report joined. */
export function updateSent(volunteerId: string, at: string, patch: Partial<SentEntry>, now: Date = new Date(), store: Store | null = defaultStore()): SentEntry[] {
  const entries = loadSentToday(volunteerId, now, store).map((e) => (e.at === at ? { ...e, ...patch, at } : e))
  write(volunteerId, entries, store)
  return entries
}

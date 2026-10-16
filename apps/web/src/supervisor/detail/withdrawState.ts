/**
 * What the withdraw banner shows when a WITHDRAW is in force: who sent it and when, how many
 * volunteers a supervisor has marked found safe, and who is still unconfirmed.
 * Everything here is read from `incident.withdraw`. Nothing is guessed: a field the API does not
 * send is left out, never filled in.
 */
import type { IncidentDetail } from '../contracts'

export interface WithdrawPerson {
  id: string
  safe: boolean
  /** From the API only, `volunteers/{uid}.phone`. Null when none is stored. */
  phone: string | null
}

export interface WithdrawState {
  source: 'code' | 'supervisor' | null
  sentAt: string | null
  instruction: string
  reasons: string[]
  people: WithdrawPerson[]
  confirmed: number
  total: number
  /** True when every volunteer is marked safe. The withdraw itself stays in force. */
  allSafe: boolean
}

export function withdrawState(detail: IncidentDetail): WithdrawState | null {
  const w = detail.incident.withdraw
  if (!w?.active) return null
  const safe = new Set(w.safeVolunteerIds ?? [])
  const phones = detail.volunteerPhones ?? {}
  const people = w.volunteerIds.map<WithdrawPerson>((id) => ({ id, safe: safe.has(id), phone: phones[id]?.trim() || null }))
  const confirmed = people.filter((p) => p.safe).length
  return {
    source: w.source === 'code' || w.source === 'supervisor' ? w.source : null,
    sentAt: w.sentAt ?? null,
    instruction: w.instruction,
    reasons: w.reasons,
    people,
    confirmed,
    total: people.length,
    allSafe: people.length > 0 && confirmed === people.length,
  }
}

/** The people a supervisor still has to reach. */
export function unconfirmed(state: WithdrawState): WithdrawPerson[] {
  return state.people.filter((p) => !p.safe)
}

/** Seconds since the send, as m:ss (h:mm:ss from one hour). Null when the send time is unknown or in the future. */
export function elapsedSince(sentAt: string | null, nowMs: number): string | null {
  if (!sentAt) return null
  const sent = Date.parse(sentAt)
  if (Number.isNaN(sent)) return null
  const total = Math.max(0, Math.floor((nowMs - sent) / 1000))
  const two = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
}

/** A `tel:` link from the stored number. Spaces and punctuation are dropped; a leading + is kept. */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '')
  return /\d/.test(digits) ? `tel:${digits}` : null
}

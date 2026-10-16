/**
 * Display rules for the console. The UI only shows what ember-api returns;
 * these helpers decide labels and which controls exist, never incident state.
 */
import type { Incident, IncidentDetail, Observation, Severity, Task } from './contracts'

export const SEVERITY_LABEL: Record<Severity, string> = {
  none: 'No fire',
  smoke: 'Smoke',
  small_flame: 'Small flame',
  large_flame: 'Large flame',
  unknown: 'Unknown',
}

export const STATUS_LABEL: Record<Incident['status'], string> = {
  open: 'Open',
  held: 'Held · conflict',
  verified: 'Verified',
  extinguished: 'Extinguished',
}

export const TASK_LABEL: Record<Task['type'], string> = {
  verify: 'Verify',
  investigate: 'Dispatch',
  withdraw: 'Withdraw',
  instruct: 'Instruction',
}

/** "uid_dedi" -> "Dedi". Ids are all the contract gives the console. */
export function volunteerName(id: string): string {
  const base = id.replace(/^uid_/, '')
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : id
}

/** Active withdraw first, then held incidents, then by evidence score. */
export function sortQueue(incidents: Incident[]): Incident[] {
  const rank = (i: Incident) => (i.withdraw?.active ? 0 : i.status === 'held' ? 1 : 2)
  return [...incidents].sort((a, b) => rank(a) - rank(b) || b.evidenceScore - a.evidenceScore || a.id.localeCompare(b.id))
}

export interface TaskControls {
  /** Approve, Edit and Reject are offered only on a proposed, non-withdraw task. */
  canDecide: boolean
  /** Why Approve is disabled, when it is. The backend enforces the same rule. */
  approveBlocked: string | null
}

export const HELD_NOTE = 'Dispatch is held until the conflict is resolved.'

export function taskControls(task: Task, detail: Pick<IncidentDetail, 'conflict'>): TaskControls {
  const canDecide = task.status === 'proposed' && task.type !== 'withdraw'
  const held = task.type === 'investigate' && detail.conflict?.status === 'open'
  return { canDecide, approveBlocked: canDecide && held ? HELD_NOTE : null }
}

/** The two conflicting observations in the order the conflict lists them. */
export function conflictPair(detail: IncidentDetail): Observation[] {
  if (!detail.conflict) return []
  const byId = new Map(detail.observations.map((o) => [o.id, o]))
  return detail.conflict.observationIds.map((id) => byId.get(id)).filter((o): o is Observation => Boolean(o))
}

export interface WithdrawBanner {
  instruction: string
  reasons: string[]
  volunteerIds: string[]
}

/** Shown whenever the incident carries an active withdraw, whatever its severity. */
export function withdrawBanner(incident: Incident): WithdrawBanner | null {
  const w = incident.withdraw
  if (!w?.active) return null
  return { instruction: w.instruction, reasons: w.reasons, volunteerIds: w.volunteerIds }
}

/** Verify is the only incident action on this screen (demo step 6). */
export function canVerify(incident: Incident): boolean {
  return incident.status === 'open' || incident.status === 'held'
}


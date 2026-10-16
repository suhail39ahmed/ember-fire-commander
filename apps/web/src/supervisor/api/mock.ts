/**
 * Mock ember-api for the console (VITE_USE_MOCK_API=true). Synthetic data only.
 * It applies the same rules as the backend in contract section 6.5 so the UI
 * is exercised against the real outcomes, including 409 while dispatch is held.
 */
import { ApiError } from '../../pwa/api/types'
import type { IncidentDetail, Task } from '../contracts'
import { lowerChoices } from '../detail/severityModel'
import { fixture, type FixtureName } from '../fixtures'
import { regionFixtures } from '../map/fixtures'
import { volunteerName } from '../view'
import type { AuditEntry, AuditPage, SupervisorApi } from './types'

/** `region` loads three incidents at distinct positions for the map. */
export type MockScenario = FixtureName | 'region' | 'empty'

type AuditRow = { id: string; actorId: string; action: string; targetId: string; at: string }

export interface SupervisorMockControls {
  load(name: MockScenario): void
  readonly audit: readonly AuditRow[]
}

const conflictError = (message: string) => new ApiError('conflict', message, 409, false)
const notFound = () => new ApiError('not_found', 'id is unknown', 404, false)

function seedAudit(details: IncidentDetail[], actorId: string): AuditRow[] {
  if (details.length === 0) return []
  const d = details[0]
  const rows: AuditRow[] = []
  const push = (action: string, targetId: string, at: string, who = actorId) => {
    rows.push({ id: `aud_seed_${rows.length + 1}`, actorId: who, action, targetId, at })
  }
  for (const obs of d.observations) {
    push('observation.create', obs.id, obs.receivedAt || obs.capturedAt, obs.volunteerId)
  }
  for (const task of d.tasks.filter((t) => t.status === 'approved' && t.type !== 'withdraw')) {
    push('task.approve', task.id, '2026-10-17T03:10:00Z')
  }
  if (d.incident.status === 'verified' || d.incident.status === 'extinguished') {
    push('incident.verify', d.incident.id, '2026-10-17T03:12:00Z')
  }
  if (d.incident.withdraw?.active) {
    push('task.withdraw', d.incident.id, d.incident.withdraw.sentAt || '2026-10-17T03:15:00Z', 'code')
  }
  return rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

function presentAudit(row: AuditRow, details: IncidentDetail[]): AuditEntry {
  const actorName = row.actorId === 'code' ? 'AI' : volunteerName(row.actorId)
  let target = row.targetId
  let detail = '—'
  let incidentId: string | null = null

  if (row.action === 'observation.create') {
    for (const d of details) {
      const obs = d.observations.find((o) => o.id === row.targetId)
      if (obs) {
        target = `obs · ${obs.volunteerName || volunteerName(obs.volunteerId)}`
        detail = obs.chip ? `chip ${obs.chip} · ${obs.severity}` : `text · ${obs.severity}`
        incidentId = d.incident.id
        break
      }
    }
  } else if (row.action.startsWith('task.') && row.action !== 'task.withdraw') {
    for (const d of details) {
      const task = d.tasks.find((t) => t.id === row.targetId)
      if (task) {
        target = `${task.type} · ${volunteerName(task.volunteerId)}`
        incidentId = task.incidentId
        if (row.action === 'task.edit') detail = 'Instruction replaced'
        else if (row.action === 'task.approve' && d.conflict?.status === 'open') {
          detail = 'Approved while conflict open (allowed)'
        }
        break
      }
    }
  } else {
    const d = details.find((x) => x.incident.id === row.targetId)
    if (d) {
      target = d.incident.name || d.incident.id
      incidentId = d.incident.id
      if (row.action === 'task.withdraw' && d.incident.withdraw) {
        const people = d.incident.withdraw.volunteerIds.map((id) => volunteerName(id)).join(', ')
        const severity = (d.incident.severity || '').replace(/_/g, ' ')
        detail = people && severity
          ? `${severity[0].toUpperCase()}${severity.slice(1)} · ${people}`
          : people || '—'
      }
    }
  }

  return {
    id: row.id,
    at: row.at,
    actorId: row.actorId,
    actorName,
    action: row.action,
    targetId: row.targetId,
    target,
    detail,
    incidentId,
  }
}

export function createMockSupervisorApi(
  actorId: string,
  initial: MockScenario = 'conflict',
  latencyMs = 300,
): SupervisorApi & { mock: SupervisorMockControls } {
  let details: IncidentDetail[] = []
  /** Rows from the loaded fixture for GET /audit. Separate from decision writes below. */
  let seed: AuditRow[] = []
  /** Append-only writes from approve/reject/… — what existing tests assert on. */
  const audit: AuditRow[] = []

  const load = (name: MockScenario) => {
    details = name === 'empty' ? [] : name === 'region' ? regionFixtures() : [fixture(name)]
    audit.length = 0
    seed = seedAudit(details, actorId)
  }
  load(initial)

  const wait = () => new Promise((r) => setTimeout(r, latencyMs))
  const append = (action: string, targetId: string) => {
    const id = `aud_mock_${audit.length + 1}`
    audit.push({ id, actorId, action, targetId, at: new Date().toISOString() })
    return id
  }
  const findTask = (id: string): [IncidentDetail, Task] => {
    for (const d of details) {
      const t = d.tasks.find((x) => x.id === id)
      if (t) return [d, t]
    }
    throw notFound()
  }
  /** Like the route: the send time, the attempt count, and the moment a resend opens. */
  const stamp = (t: Task, count: number) => {
    const now = Date.now()
    t.sentAt = new Date(now).toISOString()
    t.sendCount = count
    t.heardAt = null
    t.resendAt = new Date(now + 60000).toISOString()
  }
  const decide = (id: string, verb: 'approved' | 'rejected') => {
    const [detail, t] = findTask(id)
    if (t.type === 'withdraw') throw conflictError(`A withdraw task is never proposed and cannot be ${verb}`)
    if (t.status !== 'proposed') throw conflictError(`Only a proposed task can be ${verb}`)
    if (verb === 'approved' && t.type === 'investigate' && detail.conflict?.status === 'open') {
      throw conflictError('Dispatch is held while this incident has an open conflict')
    }
    t.status = verb
    if (verb === 'approved') stamp(t, 1)
    return { task: structuredClone(t), auditId: append(verb === 'approved' ? 'task.approve' : 'task.reject', id) }
  }

  return {
    async listIncidents() {
      await wait()
      // Like GET /incidents for a supervisor: an extinguished incident leaves the live list.
      return details.filter((d) => d.incident.status !== 'extinguished').map((d) => structuredClone(d.incident))
    },
    async getIncident(id) {
      await wait()
      const d = details.find((x) => x.incident.id === id)
      if (!d) throw notFound()
      return structuredClone(d)
    },
    async listAudit(query = {}) {
      await wait()
      let rows = [...seed, ...audit].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1))
      if (query.targetId) rows = rows.filter((row) => row.targetId === query.targetId)
      if (query.cursor) {
        const index = rows.findIndex((row) => row.id === query.cursor)
        rows = index >= 0 ? rows.slice(index + 1) : rows
      }
      const limit = query.limit ?? 50
      const page = rows.slice(0, limit)
      const next = rows.length > limit ? page[page.length - 1]?.id ?? null : null
      const result: AuditPage = {
        items: page.map((row) => presentAudit(row, details)),
        nextCursor: next,
      }
      return result
    },
    async approveTask(id) {
      await wait()
      return decide(id, 'approved')
    },
    async rejectTask(id) {
      await wait()
      return decide(id, 'rejected')
    },
    async resendTask(id) {
      await wait()
      const [, t] = findTask(id)
      if (t.status !== 'approved') throw conflictError('Only a sent instruction can be sent again')
      if (t.heardAt) throw conflictError('This instruction was already heard')
      stamp(t, (t.sendCount ?? 1) + 1)
      return { task: structuredClone(t), auditId: append('task.resend', id) }
    },
    async editTask(id, instruction) {
      await wait()
      const text = instruction.trim()
      if (!text) throw new ApiError('validation_error', 'instruction is not valid', 400, false, { instruction: 'required, a non-empty string' })
      const [, t] = findTask(id)
      if (t.type === 'withdraw') throw conflictError('A withdraw instruction cannot be edited')
      t.instruction = text
      return { task: structuredClone(t), auditId: append('task.edit', id) }
    },
    async verifyIncident(id) {
      await wait()
      const d = details.find((x) => x.incident.id === id)
      if (!d) throw notFound()
      if (d.incident.status !== 'open' && d.incident.status !== 'held') {
        throw conflictError(`An incident that is ${d.incident.status} cannot be verified`)
      }
      d.incident.status = 'verified'
      return { incident: structuredClone(d.incident), auditId: append('incident.verify', id) }
    },
    async withdrawIncident(id, request) {
      await wait()
      const d = details.find((x) => x.incident.id === id)
      if (!d) throw notFound()
      const ids = [...new Set(request.volunteerIds)]
      if (ids.length === 0 || ids.some((v) => typeof v !== 'string' || !v)) {
        throw new ApiError('validation_error', 'volunteerIds is not valid', 400, false, { volunteerIds: 'required, a non-empty list of volunteer ids' })
      }
      const instruction = request.instruction.trim()
      if (!instruction || instruction.length > 500) {
        throw new ApiError('validation_error', 'instruction is not valid', 400, false, { instruction: 'required, not blank, at most 500 characters' })
      }
      const known = new Set([...d.observations.map((o) => o.volunteerId), ...d.tasks.map((t) => t.volunteerId)])
      if (ids.some((v) => !known.has(v))) {
        throw new ApiError('validation_error', 'volunteerIds is not valid', 400, false, { volunteerIds: 'every id must already have an observation or a task on this incident' })
      }
      const before = d.incident.withdraw
      d.incident.withdraw = {
        active: true,
        instruction,
        reasons: request.reasons ?? [],
        volunteerIds: [...new Set([...(before?.volunteerIds ?? []), ...ids])],
        source: before?.source ?? 'supervisor',
        sentAt: before?.sentAt ?? new Date().toISOString(),
        safeVolunteerIds: before?.safeVolunteerIds ?? [],
      }
      for (const volunteerId of ids) {
        d.tasks.push({ id: `task_mock_withdraw_${d.tasks.length + 1}`, incidentId: id, volunteerId, type: 'withdraw', status: 'approved', instruction })
      }
      return { incident: structuredClone(d.incident), auditId: append('task.withdraw', id) }
    },
    async markWithdrawSafe(id, volunteerId) {
      await wait()
      const d = details.find((x) => x.incident.id === id)
      if (!d) throw notFound()
      const w = d.incident.withdraw
      if (!w?.active) throw conflictError('This incident has no active withdraw')
      if (!volunteerId || !w.volunteerIds.includes(volunteerId)) {
        throw new ApiError('validation_error', 'volunteerId is not valid', 400, false, { volunteerId: 'not part of this withdraw' })
      }
      const safe = w.safeVolunteerIds ?? []
      if (safe.includes(volunteerId)) throw conflictError('This volunteer is already marked safe')
      // The withdraw itself stays active: there is no call that clears it.
      w.safeVolunteerIds = [...safe, volunteerId]
      return { incident: structuredClone(d.incident), auditId: append('withdraw.safe', id) }
    },
    async lowerSeverity(id, severity) {
      await wait()
      const d = details.find((x) => x.incident.id === id)
      if (!d) throw notFound()
      if (!(['none', 'smoke', 'small_flame', 'large_flame'] as string[]).includes(severity)) {
        throw new ApiError('validation_error', 'severity is not valid', 400, false, { severity: 'use none, smoke, small_flame, or large_flame' })
      }
      if (!lowerChoices(d.incident.severity).includes(severity)) {
        throw conflictError('Severity can only be lowered')
      }
      // Only severity changes. An active withdraw stays in effect.
      d.incident.severity = severity
      return { incident: structuredClone(d.incident), auditId: append('incident.severity.lower', id) }
    },
    async extinguishIncident(id) {
      await wait()
      const d = details.find((x) => x.incident.id === id)
      if (!d) throw notFound()
      if (d.incident.status === 'extinguished') throw conflictError('The incident is already extinguished')
      d.incident.status = 'extinguished'
      return { incident: structuredClone(d.incident), auditId: append('incident.extinguish', id) }
    },
    mock: {
      load,
      get audit() {
        return audit
      },
    },
  }
}

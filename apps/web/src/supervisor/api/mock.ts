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
import type { SupervisorApi } from './types'

/** `region` loads three incidents at distinct positions for the map. */
export type MockScenario = FixtureName | 'region' | 'empty'

export interface SupervisorMockControls {
  load(name: MockScenario): void
  readonly audit: readonly { id: string; action: string; targetId: string }[]
}

const conflictError = (message: string) => new ApiError('conflict', message, 409, false)
const notFound = () => new ApiError('not_found', 'id is unknown', 404, false)

export function createMockSupervisorApi(
  actorId: string,
  initial: MockScenario = 'conflict',
  latencyMs = 300,
): SupervisorApi & { mock: SupervisorMockControls } {
  let details: IncidentDetail[] = []
  const audit: { id: string; actorId: string; action: string; targetId: string; at: string }[] = []

  const load = (name: MockScenario) => {
    details = name === 'empty' ? [] : name === 'region' ? regionFixtures() : [fixture(name)]
    audit.length = 0
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
  const decide = (id: string, verb: 'approved' | 'rejected') => {
    const [detail, t] = findTask(id)
    if (t.type === 'withdraw') throw conflictError(`A withdraw task is never proposed and cannot be ${verb}`)
    if (t.status !== 'proposed') throw conflictError(`Only a proposed task can be ${verb}`)
    if (verb === 'approved' && t.type === 'investigate' && detail.conflict?.status === 'open') {
      throw conflictError('Dispatch is held while this incident has an open conflict')
    }
    t.status = verb
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
    async approveTask(id) {
      await wait()
      return decide(id, 'approved')
    },
    async rejectTask(id) {
      await wait()
      return decide(id, 'rejected')
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

/**
 * Mock ember-api for the console (VITE_USE_MOCK_API=true). Synthetic data only.
 * It applies the same rules as the backend in contract section 6.5 so the UI
 * is exercised against the real outcomes, including 409 while dispatch is held.
 */
import { ApiError } from '../../pwa/api/types'
import type { IncidentDetail, Task } from '../contracts'
import { fixture, type FixtureName } from '../fixtures'
import type { SupervisorApi } from './types'

export interface SupervisorMockControls {
  load(name: FixtureName | 'empty'): void
  readonly audit: readonly { id: string; action: string; targetId: string }[]
}

const conflictError = (message: string) => new ApiError('conflict', message, 409, false)
const notFound = () => new ApiError('not_found', 'id is unknown', 404, false)

export function createMockSupervisorApi(
  actorId: string,
  initial: FixtureName | 'empty' = 'conflict',
  latencyMs = 300,
): SupervisorApi & { mock: SupervisorMockControls } {
  let details: IncidentDetail[] = []
  const audit: { id: string; actorId: string; action: string; targetId: string; at: string }[] = []

  const load = (name: FixtureName | 'empty') => {
    details = name === 'empty' ? [] : [fixture(name)]
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
      return details.map((d) => structuredClone(d.incident))
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
    mock: {
      load,
      get audit() {
        return audit
      },
    },
  }
}

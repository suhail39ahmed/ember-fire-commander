import { describe, expect, it } from 'vitest'

import { pushPath } from '../push/target'

describe('pushPath (#133)', () => {
  it('opens WITHDRAW for a withdraw push, whatever else it carries', () => {
    expect(pushPath({ type: 'withdraw', taskId: 't2', incidentId: 'inc_1' })).toBe('/pwa?push=withdraw')
  })
  it('opens the task named in any other push', () => {
    expect(pushPath({ type: 'verify', taskId: 'task_1' })).toBe('/pwa/task/task_1')
    expect(pushPath({ type: 'instruct', taskId: 'task_2' })).toBe('/pwa/task/task_2')
  })
  it('escapes an id so it cannot leave the path', () => {
    expect(pushPath({ taskId: '../x?y' })).toBe('/pwa/task/..%2Fx%3Fy')
  })
  it('opens Home when there is nothing to open', () => {
    expect(pushPath(null)).toBe('/pwa')
    expect(pushPath({})).toBe('/pwa')
    expect(pushPath({ taskId: '  ' })).toBe('/pwa')
  })
})

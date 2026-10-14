import { describe, expect, it } from 'vitest'
import type { Digest, Task } from '../contracts/types'
import { activeWithdraw, currentTask } from '../digest'

const task = (id: string, type: Task['type'], status: Task['status']): Task => ({
  id, incidentId: 'inc_demo_01', volunteerId: 'uid_sari', type, status, instruction: id,
})
const digest = (myTasks: Task[], volunteerIds: string[] | null = null): Digest => ({
  updatedAt: '2026-10-17T03:00:00Z',
  incidents: [{
    id: 'inc_demo_01', status: 'held', severity: 'small_flame', lat: -1.849, lng: 110.051,
    withdraw: volunteerIds ? { active: true, instruction: 'Withdraw upwind.', reasons: ['large flame reported'], volunteerIds } : null,
  }],
  myTasks,
})

describe('currentTask', () => {
  it('ignores proposed and rejected tasks', () => {
    expect(currentTask(digest([task('a', 'verify', 'proposed'), task('b', 'investigate', 'rejected')]))).toBeNull()
  })

  it('prefers a withdraw task over a newer task', () => {
    expect(currentTask(digest([task('w', 'withdraw', 'approved'), task('v', 'verify', 'approved')]))?.id).toBe('w')
  })

  it('otherwise takes the newest approved task', () => {
    expect(currentTask(digest([task('v1', 'verify', 'approved'), task('v2', 'verify', 'approved')]))?.id).toBe('v2')
  })
})

describe('activeWithdraw', () => {
  it('applies only to the named volunteers', () => {
    expect(activeWithdraw(digest([], ['uid_sari']), 'uid_sari')?.instruction).toBe('Withdraw upwind.')
    expect(activeWithdraw(digest([], ['uid_dedi']), 'uid_sari')).toBeNull()
    expect(activeWithdraw(digest([]), 'uid_sari')).toBeNull()
  })
})

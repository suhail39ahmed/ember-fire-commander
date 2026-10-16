import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { createHttpApi, ENDPOINTS } from '../../pwa/api/client'
import { createMockApi } from '../../pwa/api/mock'
import { ApiError } from '../../pwa/api/types'
import type { Digest } from '../../pwa/contracts/types'
import { tasksToMarkHeard } from '../../pwa/heard'
import { createHttpSupervisorApi, SUPERVISOR_ENDPOINTS } from '../api/client'
import { createMockSupervisorApi } from '../api/mock'
import type { IncidentDetail } from '../contracts'
import { fixture } from '../fixtures'
import { instructionFailure, instructionProblem, sendBlock, submitInstruction } from '../detail/instructionModel'
import { popupFor } from '../detail/popupModel'
import { VolunteerPopup } from '../detail/VolunteerPopup'

const NOW = Date.parse('2026-10-17T03:10:00Z')
const headers = async () => ({ Authorization: 'Bearer t' })
const json = (data: unknown, status: number) => new Response(JSON.stringify(data), { status })
const ok = async () => ({ task: fixture('normal').tasks[0], auditId: 'aud_77' })

function html(detail: IncidentDetail, id: string, over: { lang?: 'id' | 'en'; offline?: boolean } = {}) {
  return renderToStaticMarkup(
    <VolunteerPopup
      lang={over.lang ?? 'en'} detail={detail} volunteerId={id} onClose={() => undefined} offline={over.offline ?? false} now={NOW}
      sendInstruction={ok} photoUrl={async () => ({ url: 'https://photo.example/x.jpg', expiresAt: '2026-10-17T03:15:00Z' })}
    />,
  )
}

describe('send one instruction: the rules before a request', () => {
  it('offers a send on an open incident and a volunteer with no withdraw', () => {
    expect(sendBlock(fixture('conflict'), 'uid_sari', false)).toBeNull()
  })

  it('blocks offline, on an extinguished incident, and for a volunteer under an unconfirmed withdraw', () => {
    expect(sendBlock(fixture('conflict'), 'uid_sari', true)).toBe('offline')
    const done = fixture('conflict')
    done.incident.status = 'extinguished'
    expect(sendBlock(done, 'uid_sari', false)).toBe('extinguished')
    expect(sendBlock(fixture('withdraw'), 'uid_dedi', false)).toBe('withdraw')
  })

  it('lifts the block once that volunteer is marked safe, and only for them', () => {
    const d = fixture('withdraw')
    d.incident.withdraw!.safeVolunteerIds = ['uid_dedi']
    expect(sendBlock(d, 'uid_dedi', false)).toBeNull()
    expect(sendBlock(d, 'uid_sari', false)).toBe('withdraw')
  })

  it('refuses blank and oversized text without a request', async () => {
    expect(instructionProblem('   ')).toBe('blank')
    expect(instructionProblem('x'.repeat(501))).toBe('too_long')
    expect(instructionProblem('x'.repeat(500))).toBeNull()
    const send = vi.fn(ok)
    const result = await submitInstruction(send, '  ', 'Sari', 'en')
    expect(result).toEqual({ ok: false, text: 'Write the instruction first.' })
    expect(send).not.toHaveBeenCalled()
  })

  it('sends the trimmed text once and says it was logged with the audit id', async () => {
    const send = vi.fn(ok)
    const result = await submitInstruction(send, '  Mundur ke jalan  ', 'Sari', 'en')
    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith('Mundur ke jalan')
    expect(result).toEqual({ ok: true, auditId: 'aud_77', text: 'Sent to Sari · logged aud_77' })
  })

  it.each([
    [new ApiError('network', 'x', null, true), 'Could not reach ember-api'],
    [new ApiError('validation_error', 'x', 400, false), 'not valid'],
    [new ApiError('forbidden', 'x', 403, false), 'cannot send instructions'],
    [new ApiError('not_found', 'x', 404, false), 'no longer exists'],
    [new ApiError('conflict', 'x', 409, false), 'WITHDRAW is in force'],
    [new ApiError('internal', 'x', 500, true), 'could not send this'],
    [new Error('boom'), 'could not send this'],
  ])('words a refusal in both languages without a status code (%#)', (error, en) => {
    expect(instructionFailure(error, 'en')).toContain(en)
    const id = instructionFailure(error, 'id')
    expect(id).not.toBe(instructionFailure(error, 'en'))
    expect(id).not.toMatch(/\b(40\d|50\d)\b|ApiError/)
  })

  it('never sends a free instruction on a failed request: it reports and does not throw', async () => {
    const result = await submitInstruction(async () => { throw new ApiError('conflict', 'x', 409, false) }, 'Tunggu', 'Sari', 'id')
    expect(result.ok).toBe(false)
    expect(result.text).toContain('MUNDUR')
  })
})

describe('the volunteer pop-up with real data', () => {
  function enriched(): IncidentDetail {
    const d = fixture('conflict')
    d.volunteers = [{
      volunteerId: 'uid_sari', name: 'Sari', reportCount: 1, firstReportAt: '2026-10-17T03:05:00Z', lastReportAt: '2026-10-17T03:05:00Z',
      lastSeverity: 'smoke', lastLat: -1.849, lastLng: 110.051, lastAccuracyM: 22, distanceM: 140, lastHeardAt: '2026-10-17T03:08:00Z', pushReady: true, withdraw: null,
    }]
    return d
  }

  it('shows last heard and the device from the card', () => {
    const out = html(enriched(), 'uid_sari')
    expect(out).toMatch(/<dt>Last heard<\/dt><dd>[^<—][^<]*<\/dd>/)
    expect(out).toContain('<dt>Device</dt><dd>Push token stored</dd>')
    expect(out).toContain('<dt>Distance</dt><dd>140 m from the incident centre</dd>')
  })

  it('says no token is stored, and a dash when there is no card at all', () => {
    const d = enriched()
    d.volunteers![0].pushReady = false
    expect(html(d, 'uid_sari')).toContain('<dt>Device</dt><dd>No push token stored</dd>')
    expect(html(fixture('conflict'), 'uid_sari')).toContain('<dt>Device</dt><dd>—</dd>')
  })

  it('lists the proposed task as a suggestion with its stored reason, and the evidence factors', () => {
    const out = html(fixture('conflict'), 'uid_sari')
    expect(out).toContain('Why: the reports on this incident disagree.')
    expect(out).toContain('Conflict · −20')
    expect(out).toContain('reports disagree')
  })

  it('says nothing is waiting when no task is proposed for this volunteer, and gives no reason it does not have', () => {
    const d = fixture('conflict')
    d.tasks = d.tasks.map((t) => ({ ...t, status: 'approved' as const }))
    expect(popupFor(d, 'uid_sari', 'en')!.suggestions).toEqual([])
    expect(html(d, 'uid_sari')).toContain('No suggestion is waiting for this volunteer.')
    const noConflict = fixture('conflict')
    noConflict.conflict = null
    expect(html(noConflict, 'uid_sari')).toContain('No reason was recorded.')
  })

  it('shows the delivery state of a sent instruction', () => {
    const d = fixture('conflict')
    d.tasks = d.tasks.map((t) => ({ ...t, status: 'approved' as const, sentAt: '2026-10-17T03:06:00Z', heardAt: '2026-10-17T03:07:00Z' }))
    const out = html(d, 'uid_sari')
    expect(out).toMatch(/heard/i)
    expect(out).not.toContain('Not heard')
    expect(out).not.toContain('Not available yet</b> · Needs a route')
  })

  it('turns the send form off for a volunteer under an unconfirmed withdraw, offline and when extinguished', () => {
    const w = html(fixture('withdraw'), 'uid_dedi')
    expect(w).toContain('A free instruction cannot hold or replace it.')
    expect(w).toMatch(/<textarea[^>]*disabled/)
    expect(html(fixture('conflict'), 'uid_sari', { offline: true })).toContain('Offline · can’t send.')
    const done = fixture('conflict')
    done.incident.status = 'extinguished'
    expect(html(done, 'uid_sari')).toContain('takes no new instruction')
  })

  it('speaks Bahasa in the new regions', () => {
    const out = html(fixture('withdraw'), 'uid_dedi', { lang: 'id' })
    expect(out).toContain('MUNDUR berlaku untuk relawan ini')
    expect(html(fixture('conflict'), 'uid_sari', { lang: 'id' })).toContain('Alasan: laporan di insiden ini berbeda.')
  })
})

describe('supervisor api: the new routes', () => {
  it('POSTs the instruction to the volunteer’s route and reads the photo link with a GET', async () => {
    const fetchImpl = vi.fn(async (url: string) => (url.includes('/photos/') ? json({ url: 'https://s/x', expiresAt: 'z' }, 200) : json({ task: {}, auditId: 'aud_1' }, 201)))
    const api = createHttpSupervisorApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await api.sendInstruction('inc 1', 'uid/a', 'Tunggu')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.example${SUPERVISOR_ENDPOINTS.instruct('inc 1', 'uid/a')}`)
    expect(url).toContain('/incidents/inc%201/volunteers/uid%2Fa/instruct')
    expect([init.method, JSON.parse(init.body as string)]).toEqual(['POST', { instruction: 'Tunggu' }])
    await expect(api.getPhotoUrl('inc_1', 'obs_1')).resolves.toEqual({ url: 'https://s/x', expiresAt: 'z' })
    const [photoUrl, photoInit] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit | undefined]
    expect(photoUrl).toBe('https://api.example/incidents/inc_1/photos/obs_1')
    expect(photoInit?.method ?? 'GET').toBe('GET')
  })

  it('the mock sends one approved instruct task with an audit id and refuses what the API refuses', async () => {
    const api = createMockSupervisorApi('uid_maya', 'conflict', 0)
    const before = await api.getIncident('inc_demo_01')
    const sent = await api.sendInstruction('inc_demo_01', 'uid_sari', ' Tunggu di sini ')
    expect(sent.task).toMatchObject({ type: 'instruct', status: 'approved', instruction: 'Tunggu di sini', volunteerId: 'uid_sari' })
    expect(sent.auditId).toMatch(/\S/)
    const after = await api.getIncident('inc_demo_01')
    expect(after.tasks).toHaveLength(before.tasks.length + 1)
    await expect(api.sendInstruction('inc_demo_01', 'uid_sari', '  ')).rejects.toMatchObject({ status: 400 })
    await expect(api.sendInstruction('inc_demo_01', 'uid_nobody', 'x')).rejects.toMatchObject({ status: 400 })
    await expect(api.sendInstruction('inc_none', 'uid_sari', 'x')).rejects.toMatchObject({ status: 404 })
  })

  it('the mock refuses a volunteer under an unconfirmed withdraw and any photo that has no path', async () => {
    const api = createMockSupervisorApi('uid_maya', 'withdraw', 0)
    const list = await api.listIncidents()
    let refused = 0
    for (const inc of list) {
      const d = await api.getIncident(inc.id)
      const w = d.incident.withdraw
      if (w?.active && w.volunteerIds.length > 0) {
        await expect(api.sendInstruction(inc.id, w.volunteerIds[0], 'x')).rejects.toMatchObject({ status: 409 })
        refused += 1
      }
    }
    expect(refused).toBeGreaterThan(0)
    await expect(api.getPhotoUrl('inc_demo_01', 'obs_none')).rejects.toMatchObject({ status: 404 })
  })
})

describe('volunteer app: tell ember-api a sent task is on screen', () => {
  const task = (over: Record<string, unknown>) => ({ id: 't', incidentId: 'i', volunteerId: 'v', type: 'verify', status: 'approved', instruction: 'x', ...over })
  const digest = (tasks: unknown[]) => ({ updatedAt: '', incidents: [], myTasks: tasks }) as unknown as Digest

  it('marks only the shown sent task that is not heard yet', () => {
    const d = digest([task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c', heardAt: '2026-10-17T03:00:00Z' }), task({ id: 'd', status: 'proposed' })])
    expect(tasksToMarkHeard(d, 'a', false)).toEqual(['a'])
    expect(tasksToMarkHeard(d, 'c', false)).toEqual([])
    expect(tasksToMarkHeard(d, 'd', false)).toEqual([])
    expect(tasksToMarkHeard(d, null, false)).toEqual([])
    expect(tasksToMarkHeard(null, 'a', true)).toEqual([])
  })

  it('on the withdraw screen also marks every sent withdraw task, and nothing else', () => {
    const d = digest([task({ id: 'w1', type: 'withdraw' }), task({ id: 'w2', type: 'withdraw', heardAt: 'z' }), task({ id: 'v' })])
    expect(tasksToMarkHeard(d, null, true)).toEqual(['w1'])
    expect(tasksToMarkHeard(d, null, false)).toEqual([])
  })

  it('POSTs /tasks/{id}/heard with no body, and the mock stamps it once', async () => {
    const fetchImpl = vi.fn(async () => json({ id: 'task 1', heardAt: 'z' }, 200))
    const api = createHttpApi(async () => ({ Authorization: 'Bearer t', 'X-Firebase-AppCheck': 'c' }), 'https://api.example', fetchImpl as unknown as typeof fetch)
    await expect(api.markTaskHeard('task 1')).resolves.toBeUndefined()
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.example${ENDPOINTS.heard('task 1')}`)
    expect(url).toContain('/tasks/task%201/heard')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()

    const mock = createMockApi('uid_x', 0)
    await expect(mock.markTaskHeard('task_nope')).rejects.toBeInstanceOf(ApiError)
  })
})

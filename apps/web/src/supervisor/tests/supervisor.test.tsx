import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../pwa/api/types'
import { createHttpSupervisorApi, SUPERVISOR_ENDPOINTS } from '../api/client'
import { createMockSupervisorApi } from '../api/mock'
import { fixture } from '../fixtures'
import { IncidentView, type IncidentActions } from '../IncidentView'
import { conflictPair, sortQueue, taskControls, withdrawBanner } from '../view'

const headers = async () => ({ Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-check' })
const json = (data: unknown, status: number) => new Response(JSON.stringify(data), { status })

const noop: IncidentActions = {
  busyId: null,
  outcomes: {},
  onApprove: () => undefined,
  onReject: () => undefined,
  onEdit: () => undefined,
  onVerify: () => undefined,
}
const render = (name: Parameters<typeof fixture>[0], actions: IncidentActions = noop) =>
  renderToStaticMarkup(<IncidentView detail={fixture(name)} actions={actions} />)

describe('supervisor http client', () => {
  it('calls the contract routes with both identity headers', async () => {
    const fetchImpl = vi.fn(async () => json({ task: { id: 't1', status: 'approved' }, auditId: 'aud_1' }, 200))
    const api = createHttpSupervisorApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await api.approveTask('t1')
    await api.rejectTask('t1')
    await api.editTask('t1', 'Check the east bank')
    await api.verifyIncident('inc_1')
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url]) => url)).toEqual([
      'https://api.example/tasks/t1/approve',
      'https://api.example/tasks/t1/reject',
      'https://api.example/tasks/t1/edit',
      'https://api.example/incidents/inc_1/verify',
    ])
    expect(calls.every(([, init]) => init.method === 'POST')).toBe(true)
    expect(JSON.parse(calls[2][1].body as string)).toEqual({ instruction: 'Check the east bank' })
    expect(calls[0][1].body).toBeUndefined()
    const sent = calls[0][1].headers as Record<string, string>
    expect(sent.Authorization).toBe('Bearer id-token')
    expect(sent['X-Firebase-AppCheck']).toBe('app-check')
  })

  it('reads the queue and the incident picture', async () => {
    const detail = fixture('conflict')
    const fetchImpl = vi.fn(async (url: string) => json(url.endsWith('/incidents') ? [detail.incident] : detail, 200))
    const api = createHttpSupervisorApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await expect(api.listIncidents()).resolves.toEqual([detail.incident])
    await expect(api.getIncident('inc_demo_01')).resolves.toEqual(detail)
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toBe(`https://api.example${SUPERVISOR_ENDPOINTS.incident('inc_demo_01')}`)
  })

  it('maps a 409 conflict and a 403 forbidden to non-retryable errors', async () => {
    for (const [status, code] of [[409, 'conflict'], [403, 'forbidden']] as const) {
      const api = createHttpSupervisorApi(headers, 'https://api.example', (async () => json({ error: { code, message: 'no' } }, status)) as unknown as typeof fetch)
      await expect(api.approveTask('t1')).rejects.toMatchObject({ code, status, retryable: false })
    }
  })

  it('does not send a request when signed out', async () => {
    const fetchImpl = vi.fn()
    const api = createHttpSupervisorApi(async () => null, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await expect(api.listIncidents()).rejects.toBeInstanceOf(ApiError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('offers no call that clears a withdraw or lowers severity', () => {
    const api = createHttpSupervisorApi(headers, 'https://api.example', vi.fn() as unknown as typeof fetch)
    expect(Object.keys(api).sort()).toEqual(['approveTask', 'editTask', 'getIncident', 'listIncidents', 'rejectTask', 'verifyIncident'])
  })
})

describe('supervisor mock api', () => {
  const mockApi = (name: Parameters<typeof createMockSupervisorApi>[1]) => createMockSupervisorApi('uid_maya', name, 0)

  it('approves a verify task and records the audit', async () => {
    const api = mockApi('conflict')
    const result = await api.approveTask('task_demo_verify_dedi')
    expect(result.task.status).toBe('approved')
    expect(api.mock.audit).toEqual([expect.objectContaining({ id: result.auditId, action: 'task.approve', targetId: 'task_demo_verify_dedi' })])
  })

  it('rejects a task', async () => {
    const api = mockApi('conflict')
    expect((await api.rejectTask('task_demo_verify_sari')).task.status).toBe('rejected')
  })

  it('holds dispatch while the conflict is open', async () => {
    const api = mockApi('conflict')
    await expect(api.approveTask('task_demo_investigate')).rejects.toMatchObject({ code: 'conflict', status: 409 })
    const ok = mockApi('normal')
    expect((await ok.approveTask('task_demo_investigate')).task.status).toBe('approved')
  })

  it('never decides or edits a withdraw task', async () => {
    const api = mockApi('withdraw')
    await expect(api.approveTask('task_demo_withdraw_dedi')).rejects.toMatchObject({ code: 'conflict' })
    await expect(api.editTask('task_demo_withdraw_dedi', 'Stay')).rejects.toMatchObject({ code: 'conflict' })
  })

  it('serves the empty state', async () => {
    await expect(mockApi('empty').listIncidents()).resolves.toEqual([])
  })
})

describe('console view rules', () => {
  it('puts withdraw first, then held, then by evidence score', () => {
    const a = { ...fixture('normal').incident, id: 'a', evidenceScore: 90 }
    const b = { ...fixture('conflict').incident, id: 'b' }
    const c = { ...fixture('withdraw').incident, id: 'c', evidenceScore: 10 }
    expect(sortQueue([a, b, c]).map((i) => i.id)).toEqual(['c', 'b', 'a'])
  })

  it('returns both conflicting observations in conflict order', () => {
    expect(conflictPair(fixture('conflict')).map((o) => o.severity)).toEqual(['small_flame', 'smoke'])
    expect(conflictPair(fixture('normal'))).toEqual([])
  })

  it('blocks Approve on dispatch during a conflict and hides controls on withdraw tasks', () => {
    const detail = fixture('withdraw')
    const byId = (id: string) => detail.tasks.find((t) => t.id === id)!
    expect(taskControls(byId('task_demo_verify_dedi'), detail)).toEqual({ canDecide: true, approveBlocked: null })
    expect(taskControls(byId('task_demo_investigate'), detail).approveBlocked).toMatch(/held/)
    expect(taskControls(byId('task_demo_withdraw_dedi'), detail).canDecide).toBe(false)
  })

  it('keeps the withdraw banner whatever the severity', () => {
    const incident = { ...fixture('withdraw').incident, severity: 'none' as const }
    expect(withdrawBanner(incident)?.volunteerIds).toEqual(['uid_dedi', 'uid_sari'])
    expect(withdrawBanner(fixture('conflict').incident)).toBeNull()
  })
})

describe('IncidentView', () => {
  it('shows the evidence score and both reports side by side in a conflict', () => {
    const html = render('conflict')
    expect(html).toContain('EVIDENCE SCORE')
    expect(html).toContain('>64<')
    expect(html).toContain('EMBER IS NOT SURE')
    expect(html).toContain('Report from Dedi')
    expect(html).toContain('Report from Sari')
    expect(html).toContain('Dispatch is held until the conflict is resolved.')
  })

  it('shows the withdraw alert with no way to dismiss it', () => {
    const html = render('withdraw')
    expect(html).toContain('SAFETY RULE · SENT TO 2 PHONES · NO APPROVAL NEEDED')
    expect(html).toContain('MUNDUR sekarang')
    expect(html).not.toMatch(/dismiss|send team back in/i)
  })

  it('has no control to extinguish, lower severity or clear withdraw', () => {
    for (const name of ['normal', 'conflict', 'withdraw'] as const) {
      const html = render(name)
      expect(html).not.toMatch(/extinguish|lower severity|clear withdraw/i)
      expect(html).not.toMatch(/<select/)
    }
  })

  it('shows the confirmed backend result and errors', () => {
    const html = render('conflict', {
      ...noop,
      outcomes: {
        task_demo_verify_dedi: { kind: 'ok', text: 'Confirmed by ember-api: approved · audit aud_7' },
        task_demo_investigate: { kind: 'error', text: 'Dispatch is held while this incident has an open conflict' },
      },
    })
    expect(html).toContain('Confirmed by ember-api: approved · audit aud_7')
    expect(html).toContain('role="alert">Dispatch is held while this incident has an open conflict')
  })

  it('offers Approve, Edit and Reject only on proposed tasks', () => {
    const html = render('normal')
    expect(html.match(/>Approve</g)?.length).toBe(1)
    expect(html.match(/>Reject</g)?.length).toBe(1)
    expect(html).toContain('Verify incident')
  })
})

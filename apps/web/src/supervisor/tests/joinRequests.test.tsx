import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../pwa/api/types'
import { createHttpSupervisorApi, SUPERVISOR_ENDPOINTS } from '../api/client'
import { createMockSupervisorApi } from '../api/mock'
import { ApprovalsView } from '../ApprovalsPage'
import type { PendingJoinRequest } from '../contracts'
import type { IncidentActions } from '../IncidentView'

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'ready',
    user: null,
    me: { id: 'uid_maya', displayName: 'Bu Maya', role: 'supervisor' as const },
    message: null,
    signIn: async () => undefined,
    signOut: async () => undefined,
    refreshMe: async () => undefined,
  }),
}))

const actions: IncidentActions = {
  busyId: null,
  outcomes: {},
  onApprove: () => undefined,
  onReject: () => undefined,
  saveEdit: async () => { throw new Error('not used') },
  onVerify: () => undefined,
}

function join(id = 'inc_a__uid_s', over: Partial<PendingJoinRequest> = {}): PendingJoinRequest {
  return {
    request: { id, incidentId: 'inc_a', volunteerId: 'uid_s', status: 'pending', createdAt: '2026-10-16T07:46:00Z' },
    incident: { id: 'inc_a', name: 'Dumai · #2', area: 'Dumai', label: 'Dumai · #2', status: 'open', severity: 'small_flame' },
    volunteerName: 'Sari',
    ...over,
  }
}

const ok = async () => undefined

function view(over: Partial<React.ComponentProps<typeof ApprovalsView>> = {}, lang: 'id' | 'en' = 'en') {
  return renderToStaticMarkup(
    <StaticRouter location="/console/approvals">
      <ApprovalsView
        lang={lang}
        items={[]}
        failed={false}
        actions={actions}
        offline={false}
        editor="Bu Maya"
        joins={[join()]}
        onApproveJoin={ok}
        onDeclineJoin={ok}
        {...over}
      />
    </StaticRouter>,
  )
}

describe('join requests on the approvals page', () => {
  it('shows who asks, which fire, an instruction box, and Decline and Approve', () => {
    const html = view()
    expect(html).toContain('Join requests')
    expect(html).toContain('ASKS TO JOIN · SARI')
    expect(html).toContain('href="/console/incidents/inc_a"')
    expect(html).toContain('Dumai · #2')
    expect(html).toContain('<textarea')
    expect(html).toContain('>Decline</button>')
    expect(html).toContain('>Approve and send</button>')
    expect(html).not.toMatch(/>[^<]*uid_s[^<]*</) // ids stay in attributes, never in the text
  })

  it('keeps Approve off until there is an instruction, and counts the request as waiting', () => {
    const html = view()
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Approve and send<\/button>/)
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Decline<\/button>/)
    expect(html).toContain('1 waiting for a decision')
  })

  it('is not the empty state while a request waits, and is when nothing waits at all', () => {
    expect(view()).not.toContain('Nothing is waiting for approval')
    expect(view({ joins: [] })).toContain('Nothing is waiting for approval')
  })

  it('has no section when the page was given no join handlers', () => {
    const html = view({ onApproveJoin: undefined, onDeclineJoin: undefined })
    expect(html).not.toContain('Join requests')
  })

  it('blocks both buttons while ember-api cannot be reached', () => {
    const html = view({ offline: true })
    expect(html.match(/disabled=""/g)).toHaveLength(3)
  })

  it('says what happened to a request that has left the list', () => {
    const html = view({ joins: [], joinDone: [{ id: 'x', text: 'Added to the incident · Sari · audit aud_1' }] })
    expect(html).toContain('Added to the incident · Sari · audit aud_1')
  })

  it('speaks Bahasa', () => {
    const html = view({}, 'id')
    expect(html).toContain('Permintaan bergabung')
    expect(html).toContain('MINTA BERGABUNG · SARI')
    expect(html).toContain('Setujui dan kirim')
  })

  it('names a request whose incident is gone and never prints the id', () => {
    const html = view({ joins: [join('inc_gone__uid_s', { incident: null, volunteerName: null })] })
    expect(html).toContain('Incident not found')
    expect(html).toContain('VOLUNTEER')
    expect(html).not.toMatch(/>[^<]*inc_gone[^<]*</)
  })
})

describe('join requests api', () => {
  it('reads, approves with the instruction, and declines', async () => {
    const calls: { url: string; method: string; body: unknown }[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
      return new Response(JSON.stringify([]), { status: 200 })
    }) as unknown as typeof fetch
    const api = createHttpSupervisorApi(async () => ({ Authorization: 'Bearer t' }), 'https://api.example', fetchImpl)
    await api.listJoinRequests()
    await api.approveJoinRequest('inc_a__uid_s', 'Meet at the gate')
    await api.declineJoinRequest('inc_a__uid_s')
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['GET', 'https://api.example/join-requests?status=pending'],
      ['POST', 'https://api.example/join-requests/inc_a__uid_s/approve'],
      ['POST', 'https://api.example/join-requests/inc_a__uid_s/decline'],
    ])
    expect(calls[1].body).toEqual({ instruction: 'Meet at the gate' })
    expect(SUPERVISOR_ENDPOINTS.joinRequests).toBe('/join-requests?status=pending')
  })

  it('the mock approves once: an instruct task appears and the request leaves the list', async () => {
    const api = createMockSupervisorApi('uid_maya', 'normal', 0)
    const [row] = await api.listJoinRequests()
    expect(row.volunteerName).toBeTruthy()
    const decision = await api.approveJoinRequest(row.request.id, '  Meet at the gate  ')
    expect(decision.joinRequest.status).toBe('approved')
    expect(decision.task).toMatchObject({ type: 'instruct', status: 'approved', instruction: 'Meet at the gate' })
    expect(await api.listJoinRequests()).toEqual([])
    const detail = await api.getIncident(row.request.incidentId)
    expect(detail.tasks.some((task) => task.id === decision.task?.id)).toBe(true)
    await expect(api.approveJoinRequest(row.request.id, 'again')).rejects.toMatchObject({ status: 409 })
  })

  it('the mock refuses a blank instruction and declines without a task', async () => {
    const api = createMockSupervisorApi('uid_maya', 'normal', 0)
    const [row] = await api.listJoinRequests()
    await expect(api.approveJoinRequest(row.request.id, '   ')).rejects.toBeInstanceOf(ApiError)
    expect((await api.listJoinRequests())).toHaveLength(1)
    const decision = await api.declineJoinRequest(row.request.id)
    expect(decision.joinRequest.status).toBe('declined')
    expect(decision.task).toBeUndefined()
    expect(await api.listJoinRequests()).toEqual([])
  })

  it('the mock has none when there are no incidents', async () => {
    expect(await createMockSupervisorApi('uid_maya', 'empty', 0).listJoinRequests()).toEqual([])
  })
})

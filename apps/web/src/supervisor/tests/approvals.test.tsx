import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createLanguageStore } from '../../pwa/language'
import { LanguageProvider } from '../../pwa/LanguageProvider'
import { createHttpSupervisorApi, SUPERVISOR_ENDPOINTS } from '../api/client'
import { createMockSupervisorApi } from '../api/mock'
import { ApprovalsView } from '../ApprovalsPage'
import { approvalIncidentLabel, groupByIncident } from '../approvalsModel'
import type { ProposedTask } from '../contracts'
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
vi.mock('../../pwa/api/authHeaders', () => ({ authHeadersFor: () => async () => ({ Authorization: 'Bearer test' }) }))

import { MapPage } from '../MapPage'
import { SettingsPage } from '../SettingsPage'
import { ConsoleProvider } from '../ConsoleProvider'
import { IncidentsShell } from '../SupervisorConsole'

const actions: IncidentActions = {
  busyId: null,
  outcomes: {},
  onApprove: () => undefined,
  onReject: () => undefined,
  saveEdit: async () => { throw new Error('not used') },
  onVerify: () => undefined,
}

function item(id: string, over: Partial<ProposedTask> = {}, task: Partial<ProposedTask['task']> = {}): ProposedTask {
  return {
    task: { id, incidentId: 'inc_a', volunteerId: 'uid_dedi', type: 'verify', status: 'proposed', instruction: 'Move to the east road.', ...task },
    incident: { id: 'inc_a', name: 'Dumai, Riau · Pak Dedi · #2', area: 'Dumai, Riau', label: 'Dumai, Riau · Pak Dedi · #2', status: 'open', severity: 'small_flame', conflictId: null },
    volunteerName: 'Pak Dedi',
    ...over,
  }
}

function view(over: Partial<React.ComponentProps<typeof ApprovalsView>> = {}, lang: 'id' | 'en' = 'en') {
  return renderToStaticMarkup(
    <StaticRouter location="/console/approvals">
      <ApprovalsView lang={lang} items={[item('t1')]} failed={false} actions={actions} offline={false} editor="Bu Maya" {...over} />
    </StaticRouter>,
  )
}

describe('approvals list', () => {
  it('shows each waiting task with the incident name, the volunteer and the same three controls', () => {
    const html = view()
    expect(html).toContain('Approvals')
    expect(html).toContain('1 waiting for a decision')
    expect(html).toContain('href="/console/incidents/inc_a"')
    expect(html).toContain('Dumai, Riau · Pak Dedi · #2')
    expect(html).toContain('PAK DEDI')
    expect(html).toContain('Move to the east road.')
    for (const label of ['Edit', 'Reject', 'Approve']) expect(html).toContain(`>${label}</button>`)
    expect(html).not.toContain('uid_dedi')
  })

  it('has a proper empty state, not a blank page', () => {
    const html = view({ items: [] })
    expect(html).toContain('Nothing is waiting for approval')
    expect(html).toContain('role="status"')
    expect(html).not.toContain('waiting for a decision')
  })

  it('says it is loading, and says when the read failed', () => {
    expect(view({ items: null })).toContain('Loading proposals…')
    const failed = view({ items: null, failed: true })
    expect(failed).toContain('Could not load the proposals. Retrying.')
    expect(failed).not.toContain('Loading proposals…')
  })

  it('speaks Bahasa', () => {
    const html = view({}, 'id')
    expect(html).toContain('Persetujuan')
    expect(html).toContain('menunggu keputusan')
  })

  it('leaves Approve enabled on an investigate task for a held incident; the API returns the refusal', () => {
    const held = item('t2', { incident: { ...item('x').incident!, status: 'held', conflictId: 'con_1' } }, { type: 'investigate' })
    const html = view({ items: [held] })
    // No pre-block; the supervisor clicks and ember-api returns 409, which OutcomeLine shows in plain language.
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Approve<\/button>/)
    const open = view({ items: [item('t3', {}, { type: 'investigate' })] })
    expect(open).not.toMatch(/<button[^>]*disabled=""[^>]*>Approve<\/button>/)
  })

  it('blocks every write button while ember-api cannot be reached', () => {
    const html = view({ offline: true })
    expect(html.match(/disabled=""/g)).toHaveLength(3)
  })

  it('keeps the confirmation of a decided task, which has left the list', () => {
    const html = view({
      items: [],
      actions: { ...actions, outcomes: { gone: { kind: 'ok', text: 'Confirmed by ember-api: approved · audit aud_1', action: 'approve', auditId: 'aud_1' } } },
    })
    expect(html).toContain('aud_1')
  })

  it('names a task whose incident is gone and never prints the id', () => {
    const orphan = item('t4', { incident: null, volunteerName: null })
    const html = view({ items: [orphan] })
    expect(html).toContain('Incident not found')
    expect(html).not.toContain('inc_a')
    expect(html).toContain('VOLUNTEER')
  })
})

describe('approvals model', () => {
  it('gathers neighbouring tasks of one incident under one heading', () => {
    const other = item('t3', { incident: { ...item('x').incident!, id: 'inc_b' } }, { incidentId: 'inc_b' })
    const groups = groupByIncident([item('t1'), item('t2'), other])
    expect(groups.map((g) => [g.key, g.items.length])).toEqual([['inc_a', 2], ['inc_b', 1]])
  })

  it('labels with the name, then the area, then the label ember-api built', () => {
    expect(approvalIncidentLabel(item('t1'), 'en')).toBe('Dumai, Riau · Pak Dedi · #2')
    const areaOnly = item('t1', { incident: { ...item('x').incident!, name: null } })
    expect(approvalIncidentLabel(areaOnly, 'en')).toBe('Incident · Dumai, Riau')
    const bare = item('t1', { incident: { ...item('x').incident!, name: null, area: null, label: 'Incident · 1.48°N 102.11°E' } })
    expect(approvalIncidentLabel(bare, 'en')).toBe('Incident · 1.48°N 102.11°E')
  })
})

describe('approvals api', () => {
  it('reads GET /tasks?status=proposed', async () => {
    const urls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      urls.push(String(input))
      return new Response(JSON.stringify([item('t1')]), { status: 200 })
    }) as unknown as typeof fetch
    const api = createHttpSupervisorApi(async () => ({ Authorization: 'Bearer t' }), 'https://api.example', fetchImpl)
    const rows = await api.listProposedTasks()
    expect(rows).toHaveLength(1)
    expect(urls[0]).toBe(`https://api.example${SUPERVISOR_ENDPOINTS.proposedTasks}`)
    expect(SUPERVISOR_ENDPOINTS.proposedTasks).toBe('/tasks?status=proposed')
  })

  it('the mock lists the proposed tasks of its incidents, with the incident label', async () => {
    const api = createMockSupervisorApi('uid_maya', 'normal', 0)
    const rows = await api.listProposedTasks()
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.task.status).toBe('proposed')
      expect(row.incident?.label).toBeTruthy()
    }
    const none = await createMockSupervisorApi('uid_maya', 'empty', 0).listProposedTasks()
    expect(none).toEqual([])
  })
})

function inConsole(page: React.ReactNode, path: string) {
  const store = createLanguageStore({ storage: { getItem: () => 'en', setItem: () => undefined }, root: { lang: '' } })
  return renderToStaticMarkup(
    <LanguageProvider store={store}>
      <StaticRouter location={path}>
        <ConsoleProvider chrome={{ agency: null, serverTime: '2026-10-16T07:46:00Z', approvalsCount: 0 }}>
          <IncidentsShell api={createMockSupervisorApi('uid_maya', 'region', 0)}>{page}</IncidentsShell>
        </ConsoleProvider>
      </StaticRouter>
    </LanguageProvider>,
  )
}

describe('map and settings pages', () => {
  it('the map page is not blank: it says it is loading until the incidents arrive', () => {
    const html = inConsole(<MapPage />, '/console/map')
    expect(html).toContain('Loading the map…')
  })

  it('the settings page says it is not available yet instead of rendering nothing', () => {
    const html = inConsole(<SettingsPage />, '/console/settings')
    expect(html).toContain('Settings')
    expect(html).toContain('Not available yet')
    expect(html).not.toMatch(/<form|<input|<select|<textarea/)
  })
})

import { describe, expect, it } from 'vitest'

import type { IncidentDetail, Observation } from '../contracts/types'
import { ApiError } from '../api/types'
import { createHttpApi, ENDPOINTS } from '../api/client'
import { IncidentDetailView } from '../screens/IncidentDetailScreen'
import { IncidentsList } from '../screens/IncidentsScreen'
import { completedIncidents, completedGroups, assignedTasks, liveIncidents, parseTab } from '../screens/incidentsView'
import { incidentFlowFixture } from '../api/incidentFlowFixture'
import { reportTitle } from '../screens/reportTitle'
import { detailFailure } from '../screens/useIncidentDetail'
import { digest, fakeBrowser, incident, renderVolunteer, task } from './volunteerKit'

fakeBrowser()

const done = incident({ id: 'inc_done', name: 'TOHOR-1 · Desa Tohor · #0', status: 'extinguished', severity: 'none' })
const mixed = digest({
  incidents: [incident(), incident({ id: 'inc_held', name: 'TOHOR-3', status: 'held' }), done],
  myTasks: [task(), task({ id: 'task_prop', status: 'proposed' }), task({ id: 'task_w', type: 'withdraw' })],
})

const list = (d: ReturnType<typeof digest> | null, tab: 'live' | 'completed' = 'live', lang: 'id' | 'en' = 'en') =>
  renderVolunteer(<IncidentsList digest={d} lang={lang} tab={tab} onTab={() => undefined} />, { lang })

describe('incident lists (#142, #143)', () => {
  it('splits live and completed from the digest and leaves unsent and withdraw tasks out', () => {
    expect(liveIncidents(mixed).map((i) => i.id)).toEqual(['inc_1', 'inc_held'])
    expect(completedIncidents(mixed).map((i) => i.id)).toEqual(['inc_done'])
    expect(assignedTasks(mixed).map((t) => t.id)).toEqual(['task_1'])
  })

  it('Live shows assigned tasks and my incidents, and a task opens task detail', () => {
    const html = list(mixed)
    expect(html).toContain('Assigned to me')
    expect(html).toContain('Live now')
    expect(html).toContain('href="/pwa/task/task_1"')
    expect(html).toContain('href="/pwa/incidents/inc_1"')
    expect(html).not.toContain('inc_done')
    expect(html).not.toContain('task_prop')
  })

  it('Completed shows only extinguished incidents and does not invent a closing date', () => {
    const html = list(mixed, 'completed')
    expect(html).toContain('href="/pwa/incidents/inc_done"')
    expect(html).not.toContain('href="/pwa/incidents/inc_1"')
    expect(html).toContain('data-testid="closed-missing"')
    expect(html).not.toMatch(/\d{1,2} (Okt|Oct)/)
  })

  it('shows the empty state with a Report fire button when there is nothing', () => {
    const html = list(digest())
    expect(html).toContain('data-testid="incidents-empty"')
    expect(html).toContain('href="/pwa/report"')
  })

  it('shows a loading skeleton until the digest arrives, without a false empty state', () => {
    expect(list(null)).toContain('data-testid="incidents-skeleton"')
    expect(list(null)).not.toContain('data-testid="incidents-empty"')
  })

  it('an empty Completed list has no Report fire button', () => {
    const html = list(digest({ incidents: [incident()] }), 'completed')
    expect(html).toContain('No completed incidents yet.')
    expect(html).not.toContain('href="/pwa/report"')
  })

  it('reads the segment from the URL and defaults to Live', () => {
    expect(parseTab('completed')).toBe('completed')
    expect(parseTab('nope')).toBe('live')
    expect(parseTab(null)).toBe('live')
  })

  it('speaks Bahasa first', () => {
    const html = list(mixed, 'live', 'id')
    expect(html).toContain('Ditugaskan ke saya')
    expect(html).toContain('Berjalan')
  })
})

const obs = (over: Partial<Observation> = {}): Observation => ({
  id: 'obs_1', volunteerId: 'vol_1', capturedAt: '2026-10-16T08:06:00Z', receivedAt: '2026-10-16T08:06:02Z', source: 'chip',
  lat: 1.5, lng: 102.1, accuracyM: 18, chip: 'api', text: null, severity: 'small_flame', photoPath: null, immutable: true, ...over,
})
const detailOf = (over: Partial<IncidentDetail> = {}): IncidentDetail => ({
  incident: { ...incident(), evidenceScore: 64, conflictId: 'con_1' },
  observations: [obs(), obs({ id: 'obs_2', volunteerId: 'vol_2', source: 'text', text: 'No flame at the canal edge', chip: null, capturedAt: '2026-10-16T08:08:00Z', accuracyM: 20, lat: 1.501 })],
  conflict: { id: 'con_1', incidentId: 'inc_1', observationIds: ['obs_1', 'obs_2'], higherSeverity: 'small_flame', status: 'open', dispatchHeld: true },
  tasks: [],
  ...over,
})
const view = (state: Parameters<typeof IncidentDetailView>[0]['state'], lang: 'id' | 'en' = 'en') =>
  renderVolunteer(<IncidentDetailView state={state} lang={lang} volunteerId="vol_1" incidentId="inc_1" onRetry={() => undefined} onBack={() => undefined} />, { lang })

describe('incident detail (#144)', () => {
  it('shows a held incident with the conflict block, the score and the reports newest first', () => {
    const html = view({ kind: 'ready', detail: detailOf({ incident: { ...incident({ status: 'held' }), evidenceScore: 64 } }) })
    expect(html).toContain('HELD · DISPATCH ON HOLD')
    expect(html).toContain('data-testid="detail-conflict"')
    expect(html).toContain('EVIDENCE 64')
    expect(html.indexOf('report-obs_2')).toBeLessThan(html.indexOf('report-obs_1'))
    expect(html).toContain('YOU')
    expect(html).toContain('ANOTHER VOLUNTEER')
    expect(html).toContain('±18 m')
  })

  it('does not revive an old conflict block on open or verified incidents', () => {
    for (const status of ['open', 'verified'] as const) {
      expect(view({ kind: 'ready', detail: detailOf({ incident: { ...incident({ status }), evidenceScore: 64 } }) })).not.toContain('detail-conflict')
    }
  })

  it('uses generic labels when the API provides no reporter names', () => {
    const html = view({ kind: 'ready', detail: detailOf() })
    expect(html).not.toMatch(/Rizal|Sari|Ani/)
  })

  it('an open incident has no conflict block', () => {
    const html = view({ kind: 'ready', detail: detailOf({ conflict: null, incident: { ...incident(), evidenceScore: null } }) })
    expect(html).not.toContain('detail-conflict')
    expect(html).not.toContain('data-testid="detail-evidence"')
  })

  it('a resolved conflict does not show the disagree block', () => {
    const detail = detailOf()
    detail.incident.status = 'held'
    detail.conflict = { ...detail.conflict!, status: 'resolved' }
    expect(view({ kind: 'ready', detail })).not.toContain('detail-conflict')
  })

  it('draws the fire, this phone and the other reports on the position sketch', () => {
    const html = view({ kind: 'ready', detail: detailOf() })
    expect(html).toContain('data-testid="map-fire"')
    expect(html).toContain('data-testid="map-you"')
    expect(html).toContain('data-testid="map-other"')
  })

  it('Report from here opens the report screen carrying the incident id', () => {
    const html = view({ kind: 'ready', detail: detailOf() })
    expect(html).toContain('href="/pwa/report"')
    expect(html).toContain('data-testid="report-from-here"')
  })

  it('says plainly when the incident is not found, without a status code', () => {
    const html = view({ kind: 'not-found' })
    expect(html).toContain('Incident not found')
    expect(html).not.toMatch(/404/)
  })

  it('offers Try again after a network failure but not after a refusal', () => {
    expect(view({ kind: 'error', retryable: true })).toContain('Try again')
    expect(view({ kind: 'error', retryable: false })).not.toContain('Try again')
  })

  it('shows a skeleton while loading', () => {
    expect(view({ kind: 'loading' })).toContain('data-testid="detail-skeleton"')
  })

  it('titles a report by its note, then its chip, then its severity', () => {
    expect(reportTitle(obs({ text: ' hi ' }), 'en')).toBe('hi')
    expect(reportTitle(obs({ text: null, chip: 'aman' }), 'en')).toBe('Safe (aman)')
    expect(reportTitle(obs({ text: null, chip: null, severity: 'smoke', source: 'photo' }), 'id')).toBe('Asap')
  })

  it('maps a 404 to not-found and anything else to an error', () => {
    expect(detailFailure(new ApiError('not_found', 'x', 404, false))).toEqual({ kind: 'not-found' })
    expect(detailFailure(new ApiError('network', 'x', null, true))).toEqual({ kind: 'error', retryable: true })
    expect(detailFailure(new ApiError('forbidden', 'x', 403, false))).toEqual({ kind: 'error', retryable: false })
    expect(detailFailure(new TypeError('boom'))).toEqual({ kind: 'error', retryable: true })
  })
})

describe('GET /incidents/{id} client', () => {
  it('reads the incident for the caller', async () => {
    const detail = detailOf()
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify(detail), { status: 200 })
    }) as unknown as typeof fetch
    const api = createHttpApi(async () => ({ Authorization: 'Bearer t' }), 'https://api.example', fetchImpl)
    await expect(api.getIncident('inc 1')).resolves.toEqual(detail)
    expect(calls).toEqual([`https://api.example${ENDPOINTS.incident('inc 1')}`])
    expect(calls[0]).toContain('/incidents/inc%201')
  })
})

describe('Incidents flow design and metadata (#195)', () => {
  it('shows reference card metadata and only real API timestamps', () => {
    const fixture = incidentFlowFixture('vol_1')
    const html = list(fixture.digest)
    expect(html).toContain('Fires you reported, joined or were sent to.')
    expect(html).toContain('REPORTS DISAGREE')
    expect(html).toContain('HELD · DISPATCH ON HOLD')
    expect(html).toContain('TOHOR-3 · Peat field behind SDN 2')
    expect(html).toContain('Go back to the canal edge and check: is there flame?')
    expect(html).toContain('You + 3 volunteers')
    expect(html).toContain('1 TASK')
    expect(html).toContain('2 INCIDENTS')
    expect(html).toContain('href="/pwa/task/task_demo_verify"')
    const legacy = list(digest({ incidents: [incident()] }))
    expect(legacy).not.toContain('UPDATED')
    expect(legacy).not.toContain('You +')
  })

  it('preserves recent, older and undated completed incidents without using the device clock', () => {
    const d = digest({ updatedAt: '2026-10-17T12:00:00Z', incidents: [
      incident({ id: 'recent', status: 'extinguished', closedAt: '2026-10-16T12:00:00Z', reportCount: 3 }),
      incident({ id: 'boundary', status: 'extinguished', closedAt: '2026-09-17T12:00:00Z' }),
      incident({ id: 'old', status: 'extinguished', closedAt: '2026-09-01T12:00:00Z' }),
      incident({ id: 'undated', status: 'extinguished' }),
      incident({ id: 'invalid', status: 'extinguished', closedAt: 'not-a-date' }),
    ] })
    expect(completedGroups(d).recent.map((row) => row.id)).toEqual(['recent', 'boundary'])
    expect(completedGroups(d).older.map((row) => row.id)).toEqual(['old', 'undated', 'invalid'])
    const html = list(d, 'completed')
    expect(html).toContain('Last 30 days')
    expect(html).toContain('Earlier or undated')
    expect(html).toContain('Extinguished · 3 reports attached')
    for (const row of d.incidents) expect(html).toContain(`href="/pwa/incidents/${row.id}"`)
    expect(html).not.toContain('Invalid Date')
  })

  it('opens a completed incident in the same detail view without changing its status', () => {
    const fixture = incidentFlowFixture('vol_1')
    const html = list(fixture.digest, 'completed')
    expect(html).toContain('href="/pwa/incidents/inc_completed_1"')
    expect(html).toContain('6 reports attached')
    const detail = fixture.details.get('inc_completed_1')!
    const rendered = view({ kind: 'ready', detail })
    expect(rendered).toContain('Extinguished')
    expect(rendered).not.toContain('detail-conflict')
    expect(rendered).toContain('data-testid="report-from-here"')
  })

  it('renders the supplied conflict context, reporter names and compact map', () => {
    const fixture = incidentFlowFixture('vol_1')
    const detail = fixture.details.get('inc_demo_01')!
    const html = view({ kind: 'ready', detail })
    expect(html).toContain('Rizal: No fire')
    expect(html).toContain('You: Small flame')
    expect(html).toContain('Bu Maya: Go back to the canal edge and check: is there flame?')
    expect(html).toContain('Reports on this incident · 4')
    expect(html).toContain('minimap-compact')
    expect(html).toContain('viewBox="0 0 200 100"')
    expect(html.match(/data-testid="map-other"/g)).toHaveLength(2)
    expect(html).toContain('data-testid="flag-fixture_02"')
    expect(html).not.toContain('data-testid="flag-fixture_03"')
    expect(html.indexOf('report-fixture_01')).toBeLessThan(html.indexOf('report-fixture_04'))
  })

  it('keeps localized labels on completed cards and detail states', () => {
    const fixture = incidentFlowFixture('vol_1')
    const html = list(fixture.digest, 'completed', 'id')
    expect(html).toContain('30 hari terakhir')
    expect(html).toContain('Padam')
    expect(html).toContain('laporan terlampir')
    expect(view({ kind: 'ready', detail: fixture.details.get('inc_demo_01')! }, 'id')).toContain('Laporan tidak sama')
  })
})

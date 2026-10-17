import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { JoinRequestSummary, NearbyIncident } from '../contracts/types'
import { JoinedView } from '../screens/JoinedScreen'
import { JoinSheet } from '../screens/JoinSheet'
import { bearingLabel, crewLine, distanceLabel, nearbyState, pickPrompt, readDismissed, saveDismissed } from '../screens/nearby'
import { joinTask } from '../screens/incidentsView'
import { digest, fakeBrowser, incident, renderVolunteer, task, volunteerValue } from './volunteerKit'

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ signOut: async () => undefined, user: null, me: null }) }))

import { PhoneLayout } from '../layout/PhoneLayout'

fakeBrowser()

function near(over: Partial<NearbyIncident> = {}): NearbyIncident {
  return { ...incident({ id: 'inc_near', name: 'TOHOR-3 · Peat field behind SDN 2', area: 'Desa Tohor', lat: 1.51, lng: 102.1 }), distanceM: 1200, bearingDeg: 45, crewOnSite: 4, reporterName: 'Sari', ...over }
}
const request = (status: JoinRequestSummary['status'], incidentId = 'inc_near'): JoinRequestSummary => ({ incidentId, status, createdAt: '2026-10-16T08:00:00Z' })

const layout = (over = {}, lang: 'id' | 'en' = 'en') =>
  renderVolunteer(<Routes><Route path="/pwa/*" element={<PhoneLayout />} /></Routes>, { path: '/pwa', lang, value: volunteerValue(over) })

describe('nearby helpers', () => {
  it('formats distance and bearing as the design does', () => {
    expect(distanceLabel(1200)).toBe('1.2 KM')
    expect(distanceLabel(850)).toBe('850 M')
    expect(bearingLabel(45, 'en')).toBe('NE')
    expect(bearingLabel(90, 'id')).toBe('T')
  })

  it('writes the crew line from the reporter and the head count', () => {
    expect(crewLine({ crewOnSite: 3, reporterName: 'Sari' }, 'en')).toBe('Sari + 2 on site')
    expect(crewLine({ crewOnSite: 1, reporterName: 'Rizal' }, 'en')).toBe('Rizal on site')
    expect(crewLine({ crewOnSite: 4, reporterName: null }, 'en')).toBe('4 on site')
    expect(crewLine({ crewOnSite: 0, reporterName: 'Sari' }, 'en')).toBeNull()
    expect(crewLine({ crewOnSite: 3, reporterName: 'Sari' }, 'id')).toBe('Sari + 2 di lokasi')
  })

  it('reads the state of a fire from the volunteer\'s own requests', () => {
    expect(nearbyState(digest(), 'inc_near')).toBe('ask')
    expect(nearbyState(digest({ myJoinRequests: [request('pending')] }), 'inc_near')).toBe('waiting')
    expect(nearbyState(digest({ myJoinRequests: [request('declined')] }), 'inc_near')).toBe('declined')
  })

  it('suggests the nearest fire that can still be asked for and was not put aside', () => {
    const d = digest({ nearby: [near({ id: 'a' }), near({ id: 'b' }), near({ id: 'c' })], myJoinRequests: [request('pending', 'a')] })
    expect(pickPrompt(d, new Set())?.id).toBe('b')
    expect(pickPrompt(d, new Set(['b']))?.id).toBe('c')
    expect(pickPrompt(d, new Set(['b', 'c']))).toBeNull()
    expect(pickPrompt(digest(), new Set())).toBeNull()
  })

  it('keeps Not now for the session only, and survives a broken store', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
    expect(readDismissed(storage).size).toBe(0)
    saveDismissed(new Set(['inc_near']), storage)
    expect([...readDismissed(storage)]).toEqual(['inc_near'])
    data.set('ember.nearby.dismissed', '{not json')
    expect(readDismissed(storage).size).toBe(0)
    expect(readDismissed(null).size).toBe(0)
    expect(() => saveDismissed(new Set(['x']), { getItem: () => null, setItem: () => { throw new Error('full') } })).not.toThrow()
  })
})

describe('Home with fires near the phone', () => {
  const withNear = (over = {}) => ({ digest: digest({ nearby: [near()], ...over }) })

  it('shows the AI card for the nearest fire, with the figures the API sent', () => {
    const html = layout(withNear())
    expect(html).toContain('data-testid="ai-card"')
    expect(html).toContain('AI SUGGESTS · 1.2 KM FROM YOU')
    expect(html).toContain('Sari already reported this fire. Join and help?')
    expect(html).toContain('TOHOR-3 · Peat field behind SDN 2. Small flame, 4 on site.')
    expect(html).toContain('Join and help')
    expect(html).toContain('Not now')
    expect(html).toContain('Your supervisor sees that you joined.')
  })

  it('does not invent a reporter, wind or a pump request', () => {
    const html = layout(withNear({ nearby: [near({ reporterName: null })] }))
    expect(html).toContain('A fire was reported near you. Join and help?')
    expect(html).not.toMatch(/wind|pump|angin/i)
    expect(html).not.toContain('Bu Maya')
  })

  it('lists the fires under Incidents near you with distance, bearing and crew', () => {
    const html = layout(withNear({ nearby: [near(), near({ id: 'inc_2', status: 'held', distanceM: 3400, bearingDeg: 200, crewOnSite: 1, reporterName: 'Rizal', severity: 'smoke', name: 'TOHOR-5 · Canal bend' })] }))
    expect(html).toContain('Incidents near you')
    expect(html).toContain('data-testid="near-inc_near"')
    expect(html).toContain('1.2 KM · NE')
    expect(html).toContain('3.4 KM · S')
    expect(html).toContain('Sari + 3 on site')
    expect(html).toContain('Rizal on site')
    expect(html).toContain('HELD · DISPATCH ON HOLD')
    expect(html).toContain('Not assigned to you. Your supervisor can send you.')
    expect(html).toContain('SEE ALL')
  })

  it('says Request sent instead of offering a second ask, and drops the AI card', () => {
    const html = layout(withNear({ myJoinRequests: [request('pending')] }))
    expect(html).not.toContain('data-testid="ai-card"')
    expect(html).toContain('Request sent. Waiting for your supervisor.')
  })

  it('says so when the supervisor could not add the volunteer', () => {
    const html = layout(withNear({ myJoinRequests: [request('declined')] }))
    expect(html).not.toContain('data-testid="ai-card"')
    expect(html).toContain('Your supervisor could not add you right now.')
  })

  it('speaks Bahasa when the language is Bahasa', () => {
    const html = layout(withNear(), 'id')
    expect(html).toContain('AI MENYARANKAN · 1.2 KM DARI ANDA')
    expect(html).toContain('Sari sudah melaporkan api ini. Ikut membantu?')
    expect(html).toContain('Insiden di dekat Anda')
  })

  it('shows no nearby fires and no AI card when the phone is offline', () => {
    const html = layout({ ...withNear(), outbox: { items: [], online: false, submit: async () => 'sent', queuePhoto: async () => undefined, retry: async () => undefined, discard: async () => undefined, flush: async () => undefined } })
    expect(html).not.toContain('data-testid="ai-card"')
    expect(html).not.toContain('near-section')
  })

  it('asks for location when the phone cannot give a position', () => {
    expect(layout({ ...withNear(), position: { kind: 'denied' } })).toContain('data-testid="home-need-location"')
    expect(layout({ ...withNear(), position: { kind: 'waiting' } })).not.toContain('data-testid="home-need-location"')
    expect(layout(withNear())).not.toContain('data-testid="home-need-location"')
  })

  it('keeps the task card when a task is waiting, above the Report tile', () => {
    const html = layout({ digest: digest({ incidents: [incident()], myTasks: [task()] }) })
    expect(html.indexOf('home-task-title')).toBeGreaterThan(0)
    expect(html.indexOf('home-task-title')).toBeLessThan(html.indexOf('data-testid="report-tile"'))
  })

  it('shows a visible loading line with the skeleton', () => {
    const html = layout({ digest: null, digestStatus: 'loading', lastSyncAt: null })
    expect(html).toContain('Loading your incidents…')
    expect(html).toContain('data-testid="report-tile"')
  })
})

describe('fire near you sheet', () => {
  const render = (state: 'ask' | 'waiting' | 'declined', over: { sending?: boolean; failure?: 'network' | 'refused' | null; lang?: 'id' | 'en' } = {}) =>
    renderVolunteer(
      <JoinSheet incident={near()} lang={over.lang ?? 'en'} position={{ kind: 'ok', lat: 1.5, lng: 102.1, accuracyM: 10 }} state={state} sending={over.sending ?? false} failure={over.failure ?? null} onJoin={() => undefined} onClose={() => undefined} />,
      { lang: over.lang ?? 'en' },
    )

  it('is a modal dialog named by the incident, with the distance and direction', () => {
    const html = render('ask')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby="sheet-title"')
    expect(html).toContain('id="sheet-title"')
    expect(html).toContain('FIRE REPORTED 1.2 KM NE OF YOU')
    expect(html).toContain('Small flame · 4 crew on site')
  })

  it('draws the fire and the volunteer on the mini map', () => {
    const html = render('ask')
    expect(html).toContain('data-testid="map-fire"')
    expect(html).toContain('data-testid="map-you"')
  })

  it('offers Join now and Not now, and says what happens next', () => {
    const html = render('ask')
    expect(html).toContain('data-testid="sheet-join"')
    expect(html).toContain('Join now')
    expect(html).toContain('Not now')
    expect(html).toContain('Your request goes to your supervisor.')
    expect(html).not.toMatch(/wind|pump/i)
  })

  it('locks the button and says Sending… while the request goes', () => {
    const html = render('ask', { sending: true })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="sheet-join"/)
    expect(html).toContain('Sending…')
  })

  it('names a failed send, and tells a refusal from a bad connection', () => {
    expect(render('ask', { failure: 'network' })).toContain('Not sent. Check your signal and try again.')
    expect(render('ask', { failure: 'refused' })).toContain('This request cannot be sent now.')
    expect(render('ask')).not.toContain('role="alert"')
  })

  it('waits for the supervisor once the request is in', () => {
    const html = render('waiting')
    expect(html).toContain('data-testid="sheet-waiting"')
    expect(html).toContain('Request sent')
    expect(html).not.toContain('data-testid="sheet-join"')
  })

  it('says the supervisor could not add the volunteer when declined', () => {
    const html = render('declined')
    expect(html).toContain('Your supervisor could not add you right now.')
    expect(html).not.toContain('data-testid="sheet-join"')
  })

  it('speaks Bahasa', () => {
    expect(render('ask', { lang: 'id' })).toContain('Gabung sekarang')
  })
})

describe('you joined', () => {
  const sent = task({ id: 'task_join', type: 'instruct', instruction: 'Pompa di parit barat', sentAt: '2026-10-16T14:26:00' })
  const render = (over: { accepted?: boolean; position?: Parameters<typeof JoinedView>[0]['position']; action?: 'idle' | 'busy' | 'failed' } = {}) =>
    renderVolunteer(
      <JoinedView
        lang="en"
        incident={incident({ id: 'inc_1', name: 'TOHOR-3 · Peat field behind SDN 2', lat: 1.51, lng: 102.1 })}
        task={over.accepted ? { ...sent, acceptedAt: '2026-10-16T14:30:00Z' } : sent}
        position={over.position ?? { kind: 'ok', lat: 1.5, lng: 102.1, accuracyM: 10 }}
        action={{ kind: over.action ?? 'idle' }}
        onOnMyWay={() => undefined}
      />,
    )

  it('says who the volunteer is now on and when they were added', () => {
    const html = render()
    expect(html).toContain('✓ YOU JOINED · 14:26')
    expect(html).toContain('You are on TOHOR-3 · Peat field behind SDN 2')
  })

  it('works out the distance and direction from the phone and shows the first task', () => {
    const html = render()
    expect(html).toContain('Go to the fire, 1.1 km N')
    expect(html).toContain('First task')
    expect(html).toContain('Pompa di parit barat')
  })

  it('leaves the distance out when the phone has no position, and invents no meet point or wind', () => {
    const html = render({ position: { kind: 'denied' } })
    expect(html).toContain('>Go to the fire<')
    expect(html).not.toMatch(/Meet |wind|pump team/i)
  })

  it('offers I\'m on my way until it is tapped, then confirms and opens the incident', () => {
    expect(render()).toContain('data-testid="on-my-way"')
    const done = render({ accepted: true })
    expect(done).toContain('data-testid="on-my-way-done"')
    expect(done).not.toContain('data-testid="on-my-way"')
    expect(done).toContain('/pwa/incidents/inc_1')
  })

  it('shows a retry message when saving failed', () => {
    expect(render({ action: 'failed' })).toContain('role="alert"')
  })

  it('finds the newest approved instruction for the incident', () => {
    const older = task({ id: 'a', incidentId: 'inc_1', type: 'instruct', sentAt: '2026-10-16T14:00:00Z' })
    const newer = task({ id: 'b', incidentId: 'inc_1', type: 'instruct', sentAt: '2026-10-16T14:20:00Z' })
    const other = task({ id: 'c', incidentId: 'inc_2', type: 'instruct', sentAt: '2026-10-16T15:00:00Z' })
    const verify = task({ id: 'd', incidentId: 'inc_1', type: 'verify', sentAt: '2026-10-16T16:00:00Z' })
    const proposed = task({ id: 'e', incidentId: 'inc_1', type: 'instruct', status: 'proposed', sentAt: '2026-10-16T17:00:00Z' })
    expect(joinTask([older, newer, other, verify, proposed], 'inc_1')?.id).toBe('b')
    expect(joinTask([other], 'inc_1')).toBeNull()
    expect(joinTask(undefined, 'inc_1')).toBeNull()
  })
})

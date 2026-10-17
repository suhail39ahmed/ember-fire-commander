import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiError } from '../../pwa/api/types'
import { formatTimeZone } from '../../pwa/formatTime'
import { createMockSupervisorApi } from '../api/mock'
import { createHttpSupervisorApi, SUPERVISOR_ENDPOINTS } from '../api/client'
import type { IncidentDetail } from '../contracts'
import { fixture } from '../fixtures'
import type { IncidentActions } from '../IncidentView'
import { IncidentDetailView, type IncidentDetailViewProps } from '../detail/IncidentDetailView'
import { submitSafe } from '../detail/markSafe'
import { elapsedSince, telHref, unconfirmed, withdrawState } from '../detail/withdrawState'
import { safeFailureOf, safeFailureText, stateCopy } from '../detail/withdrawStateCopy'

const noop: IncidentActions = { busyId: null, outcomes: {}, onApprove: () => undefined, onReject: () => undefined, saveEdit: async () => ({ task: fixture('normal').tasks[0], auditId: 'aud_1' } as never), onVerify: () => undefined }
const NOW = Date.parse('2026-10-17T03:10:00Z')
const decision = { incident: fixture('normal').incident, auditId: 'aud_9' }

function withdrawn(over: { safe?: string[]; phones?: Record<string, string>; source?: 'code' | 'supervisor' | null; sentAt?: string | null } = {}): IncidentDetail {
  const d = fixture('withdraw')
  const w = d.incident.withdraw!
  w.safeVolunteerIds = over.safe ?? []
  if (over.source === null) delete w.source
  else if (over.source) w.source = over.source
  if (over.sentAt === null) delete w.sentAt
  else if (over.sentAt) w.sentAt = over.sentAt
  if (over.phones) d.volunteerPhones = over.phones
  return d
}

function view(detail: IncidentDetail | null, lang: 'id' | 'en' = 'en', over: Partial<IncidentDetailViewProps> = {}) {
  const props: IncidentDetailViewProps = {
    lang, incidentId: 'inc_demo_01', detail, queue: detail ? [detail.incident] : null, failure: null, link: 'online',
    lastOkAt: NOW, now: NOW, actions: noop, onRetry: () => undefined, onSelect: () => undefined,
    markSafe: async () => decision, resendTask: async () => ({ auditId: 'aud_3' }), sendWithdraw: async () => decision, actorName: 'Bu Maya',
    lowerSeverity: async () => decision, serverNow: () => NOW, extinguish: async () => decision,
    sendInstruction: async () => ({ task: fixture('normal').tasks[0], auditId: 'aud_i' }),
    photoUrl: async () => ({ url: 'https://photo.example/x.jpg', expiresAt: '2026-10-17T03:15:00Z' }), ...over,
  }
  return renderToStaticMarkup(<StaticRouter location="/console/incidents/inc_demo_01"><IncidentDetailView {...props} /></StaticRouter>)
}

describe('withdraw state', () => {
  it('counts the volunteers marked safe and lists who is still unconfirmed', () => {
    const state = withdrawState(withdrawn({ safe: ['uid_sari'] }))!
    expect([state.confirmed, state.total, state.allSafe]).toEqual([1, 2, false])
    expect(unconfirmed(state).map((p) => p.id)).toEqual(['uid_dedi'])
  })

  it('ignores a safe id that is not on the withdraw and treats a missing list as nobody safe', () => {
    const d = withdrawn({ safe: ['uid_ghost'] })
    expect(withdrawState(d)!.confirmed).toBe(0)
    delete d.incident.withdraw!.safeVolunteerIds
    expect(withdrawState(d)!.confirmed).toBe(0)
  })

  it('counts a volunteer self-safe answer (selfSafeVolunteerIds) in the confirmed total', () => {
    const d = withdrawn({ safe: [] })
    d.incident.withdraw!.selfSafeVolunteerIds = ['uid_dedi']
    const state = withdrawState(d)!
    expect([state.confirmed, state.total]).toEqual([1, 2])
    expect(unconfirmed(state).map((p) => p.id)).toEqual(['uid_sari'])
  })

  it('merges supervisor marks and self-answers without double-counting', () => {
    const d = withdrawn({ safe: ['uid_sari'] })
    d.incident.withdraw!.selfSafeVolunteerIds = ['uid_sari', 'uid_dedi']
    const state = withdrawState(d)!
    expect([state.confirmed, state.total, state.allSafe]).toEqual([2, 2, true])
  })

  it('is null when there is no active withdraw', () => {
    expect(withdrawState(fixture('conflict'))).toBeNull()
  })

  it('takes the phone only from the API and drops a blank one', () => {
    const state = withdrawState(withdrawn({ phones: { uid_dedi: ' +62 812 5550 0142 ', uid_sari: '  ' } }))!
    expect(state.people.map((p) => p.phone)).toEqual(['+62 812 5550 0142', null])
  })

  it('does not invent a source or a send time on a withdraw written before they existed', () => {
    const state = withdrawState(withdrawn({ source: null, sentAt: null }))!
    expect([state.source, state.sentAt]).toEqual([null, null])
  })

  it('counts time since the send as m:ss, h:mm:ss from an hour, and never negative', () => {
    expect(elapsedSince('2026-10-17T03:08:00Z', NOW)).toBe('2:00')
    expect(elapsedSince('2026-10-17T03:09:08Z', NOW)).toBe('0:52')
    expect(elapsedSince('2026-10-17T01:58:55Z', NOW)).toBe('1:11:05')
    expect(elapsedSince('2026-10-17T03:20:00Z', NOW)).toBe('0:00')
    expect(elapsedSince(null, NOW)).toBeNull()
    expect(elapsedSince('not a time', NOW)).toBeNull()
  })

  it('builds a tel: link from the stored number', () => {
    expect(telHref('+62 812-5550 0142')).toBe('tel:+6281255500142')
    expect(telHref('call me')).toBeNull()
  })
})

describe('withdraw not confirmed: the banner', () => {
  it('shows who sent it and when, the reason, the count and the unconfirmed volunteer', () => {
    const html = view(withdrawn({ safe: ['uid_sari'] }))
    expect(html).toContain(`WITHDRAW IN FORCE · SENT BY CODE ${formatTimeZone('2026-10-17T03:08:00Z')}`)
    expect(html).toContain('NO APPROVAL NEEDED · CANNOT BE CANCELLED HERE')
    expect(html).toContain('<b>Reason:</b> large flame reported')
    expect(html).toContain('1 of 2 confirmed safe upwind')
    expect(html).toContain('Dedi · not confirmed · 2:00')
    expect(html).toContain('WITHDRAW · 1 of 2 SAFE')
  })

  it('draws one segment per volunteer, green when safe', () => {
    const html = view(withdrawn({ safe: ['uid_sari'] }))
    expect(html.match(/class="wd-seg safe"/g)).toHaveLength(1)
    expect(html.match(/class="wd-seg"/g)).toHaveLength(1)
  })

  it('calls the unconfirmed volunteer on the number the API sent', () => {
    const html = view(withdrawn({ safe: ['uid_sari'], phones: { uid_dedi: '+62 812 5550 0142' } }))
    expect(html).toContain('href="tel:+6281255500142"')
    expect(html).toContain('>Call Dedi<')
  })

  it('has a disabled Call that says so when no number is on file, and never guesses one', () => {
    const html = view(withdrawn({ safe: ['uid_sari'], phones: {} }))
    expect(html).not.toContain('href="tel:')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Call Dedi · No phone number on file<\/button>/)
  })

  it('offers Mark found safe for each unconfirmed volunteer and nothing that cancels the withdraw', () => {
    const html = view(withdrawn({ safe: [] }))
    expect(html.match(/>Mark found safe</g)).toHaveLength(2)
    expect(html).not.toMatch(/cancel withdraw|clear withdraw|\bend withdraw|stand down|batalkan mundur/i)
  })

  it('is the plain banner once everyone is marked safe, and says the withdraw stays in force', () => {
    const html = view(withdrawn({ safe: ['uid_sari', 'uid_dedi'] }))
    expect(html).toContain('2 of 2 confirmed safe upwind')
    expect(html).toContain('stays in force until code clears it')
    expect(html).not.toContain('>Mark found safe<')
    expect(html).not.toContain('>Call ')
    expect(html).toContain('>WITHDRAW<')
    expect(html).not.toContain('SAFE</span>')
  })

  it('names a supervisor send, and leaves the source out when the API did not send one', () => {
    expect(view(withdrawn({ source: 'supervisor' }))).toContain('SENT BY SUPERVISOR')
    const html = view(withdrawn({ source: null, sentAt: null }))
    expect(html).toContain('WITHDRAW IN FORCE</p>')
    expect(html).not.toContain('SENT BY')
    expect(html).toContain('Dedi · not confirmed</p>')
  })

  it('speaks Bahasa', () => {
    const html = view(withdrawn({ safe: ['uid_sari'] }), 'id')
    expect(html).toContain('MUNDUR BERLAKU · DIKIRIM OLEH KODE')
    expect(html).toContain('1 dari 2 sudah aman di arah angin')
    expect(html).toContain('belum dipastikan')
    expect(html).toContain('Tandai sudah aman')
  })

  it('is not drawn for an incident without a withdraw', () => {
    expect(view(fixture('conflict'))).not.toContain('WITHDRAW IN FORCE')
  })

  it('turns Mark found safe off while the connection is lost', () => {
    const html = view(withdrawn({ safe: [] }), 'en', { link: 'lost' })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Mark found safe<\/button>/)
  })

  it('shows "not available yet" for an unconfirmed person when no card data is stored', () => {
    const html = view(withdrawn({ safe: ['uid_sari'] }))
    // The fixture has no volunteers cards, so last contact falls back to the not-available state.
    expect(html).toContain('Last contact not available yet')
  })

  it('shows last-heard and place facts when the card carries them', () => {
    const d = withdrawn({ safe: ['uid_sari'] })
    d.volunteers = [{
      volunteerId: 'uid_dedi', name: 'Dedi', reportCount: 1, firstReportAt: '2026-10-17T03:02:00Z',
      lastReportAt: '2026-10-17T03:02:00Z', lastSeverity: 'small_flame', lastLat: -1.849, lastLng: 110.051,
      lastAccuracyM: 15, distanceM: 120, lastHeardAt: null, pushReady: true,
      withdraw: { sentAt: '2026-10-17T03:08:00Z', heardAt: null, sendCount: 1, delivery: null, safe: false, safeAt: null, safeBy: null },
    }]
    const html = view(d)
    expect(html).toContain('Last report')
    expect(html).toContain('-1.849, 110.051')
    expect(html).not.toContain('Last contact not available yet')
  })
})

describe('withdraw not confirmed: the rest of the screen', () => {
  it('pauses the instructions with the frame’s sentence while someone is unconfirmed', () => {
    const html = view(withdrawn({ safe: ['uid_sari'] }))
    expect(html).toContain('Instructions are paused while WITHDRAW is in force. They resume when code clears it or you mark everyone safe.')
    expect(html.match(/<button[^>]*disabled=""[^>]*>Approve<\/button>/g)).toHaveLength(3)
  })

  it('lets the instructions resume once everyone is marked safe', () => {
    const html = view(withdrawn({ safe: ['uid_sari', 'uid_dedi'] }))
    expect(html).not.toContain('Instructions are paused')
    // All Approve buttons are enabled; the API handles conflict checks when clicked.
    expect(html.match(/<button[^>]*disabled=""[^>]*>Approve<\/button>/g)).toBeNull()
  })

  it('marks each volunteer card: confirmed, or not confirmed with the time since the send', () => {
    const html = view(withdrawn({ safe: ['uid_sari'] }))
    expect(html).toContain('WITHDRAW · confirmed safe upwind')
    expect(html).toContain('WITHDRAW · not confirmed · 2:00')
    expect(html).toContain('wd-unconfirmed')
  })
})

describe('marking a volunteer found safe', () => {
  it('says who was marked and the audit id', async () => {
    const result = await submitSafe(async () => decision, 'uid_dedi', 'Dedi', 'en')
    expect(result).toMatchObject({ ok: true, auditId: 'aud_9', text: 'Dedi marked found safe · logged aud_9' })
    expect((await submitSafe(async () => decision, 'uid_dedi', 'Dedi', 'id')).text).toBe('Dedi ditandai sudah aman · tercatat aud_9')
  })

  it.each([
    [new ApiError('network', 'Network error', null, true), 'network'],
    [new ApiError('conflict', 'This volunteer is already marked safe', 409, false), 'already'],
    [new ApiError('conflict', 'This incident has no active withdraw', 409, false), 'no_withdraw'],
    [new ApiError('validation_error', 'volunteerId is not valid', 400, false), 'unknown'],
    [new ApiError('forbidden', 'x', 403, false), 'session'],
    [new ApiError('not_found', 'x', 404, false), 'gone'],
    [new ApiError('internal', 'Firestore exploded: stack trace', 500, true), 'server'],
    [new Error('boom'), 'server'],
  ])('explains a failure in words and keeps the withdraw in force (%#)', async (error, failure) => {
    expect(safeFailureOf(error)).toBe(failure)
    const result = await submitSafe(async () => { throw error }, 'uid_dedi', 'Dedi', 'en')
    expect(result.ok).toBe(false)
    expect(result.text).toBe(safeFailureText(error, 'en'))
    expect(result.text).not.toMatch(/\b(409|400|403|404|500)\b|Firestore|stack trace|Error/)
    if (failure !== 'gone' && failure !== 'no_withdraw' && failure !== 'unknown') expect(result.text).toMatch(/WITHDRAW is still in force/)
  })

  it('has every failure in both languages', () => {
    for (const [key, value] of Object.entries(stateCopy)) {
      expect(value.id, key).toBeTruthy()
      expect(value.en, key).toBeTruthy()
    }
  })
})

describe('the route and the mock', () => {
  it('posts the volunteer id to /withdraw/safe', async () => {
    const calls: Array<[string, RequestInit]> = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push([url, init])
      return new Response(JSON.stringify(decision), { status: 200 })
    }) as unknown as typeof fetch
    const api = createHttpSupervisorApi(async () => ({ Authorization: 'Bearer t', 'X-Request-Id': 'r' }), 'https://api.example', fetchImpl)
    await api.markWithdrawSafe('inc_demo_01', 'uid_dedi')
    expect(calls[0][0]).toBe(`https://api.example${SUPERVISOR_ENDPOINTS.withdrawSafe('inc_demo_01')}`)
    expect(SUPERVISOR_ENDPOINTS.withdrawSafe('inc_demo_01')).toBe('/incidents/inc_demo_01/withdraw/safe')
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ volunteerId: 'uid_dedi' })
  })

  it('has no client call that clears a withdraw', () => {
    const api = createMockSupervisorApi('sup_1', 'withdraw', 0)
    expect(Object.keys(api).filter((k) => /clear|cancel|^end|stop/i.test(k))).toEqual([])
  })

  it('marks safe in the mock, audits it, counts it, and keeps the withdraw active', async () => {
    const api = createMockSupervisorApi('sup_1', 'withdraw', 0)
    const result = await api.markWithdrawSafe('inc_demo_01', 'uid_dedi')
    expect(result.incident.withdraw).toMatchObject({ active: true, safeVolunteerIds: ['uid_sari', 'uid_dedi'] })
    expect(api.mock.audit.map((a) => a.action)).toContain('withdraw.safe')
    await expect(api.markWithdrawSafe('inc_demo_01', 'uid_dedi')).rejects.toMatchObject({ status: 409 })
    await expect(api.markWithdrawSafe('inc_demo_01', 'uid_ghost')).rejects.toMatchObject({ status: 400 })
  })

  it('refuses in the mock when no withdraw is active', async () => {
    const api = createMockSupervisorApi('sup_1', 'conflict', 0)
    await expect(api.markWithdrawSafe('inc_demo_01', 'uid_dedi')).rejects.toMatchObject({ status: 409 })
  })
})

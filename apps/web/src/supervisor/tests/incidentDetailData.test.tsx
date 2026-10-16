import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { formatTimeZone } from '../../pwa/formatTime'
import type { AuditAction, IncidentDetail, TimelineEntry, VolunteerCardData } from '../contracts'
import { fixture } from '../fixtures'
import type { IncidentActions } from '../IncidentView'
import { IncidentDetailView, type IncidentDetailViewProps } from '../detail/IncidentDetailView'
import { timelineCopy } from '../detail/cardCopy'
import { actionText, actorOf, deliveryFacts, distanceLine, placeLine, safeStamp, subjectOf, summarySourceText, summaryText } from '../detail/cardModel'
import { nameOf, volunteersOf } from '../detail/model'
import { popupFor } from '../detail/popupModel'
import { withdrawState } from '../detail/withdrawState'
import { VolunteerPopup } from '../detail/VolunteerPopup'

const NOW = Date.parse('2026-10-17T03:10:00Z')
const noop: IncidentActions = { busyId: null, outcomes: {}, onApprove: () => undefined, onReject: () => undefined, saveEdit: async () => ({ task: fixture('normal').tasks[0], auditId: 'aud_1' } as never), onVerify: () => undefined }
const decision = { incident: fixture('normal').incident, auditId: 'aud_9' }

function card(over: Partial<VolunteerCardData> = {}): VolunteerCardData {
  return {
    volunteerId: 'uid_dedi', name: 'Dedi', reportCount: 1, firstReportAt: '2026-10-17T03:02:00Z', lastReportAt: '2026-10-17T03:02:00Z',
    lastSeverity: 'small_flame', lastLat: -1.849, lastLng: 110.051, lastAccuracyM: 15, distanceM: 0, lastHeardAt: '2026-10-17T03:02:04Z', pushReady: true, withdraw: null, ...over,
  }
}

const empty = { sentAt: null, heardAt: null, sendCount: null, delivery: null, safe: false, safeAt: null, safeBy: null }

/** The withdraw incident, where a third volunteer reported but the conflict lists only two sides. */
function withExtras(): IncidentDetail {
  const d = fixture('withdraw')
  d.volunteers = [
    card({ withdraw: { ...empty, sentAt: '2026-10-17T03:08:00Z', heardAt: null, sendCount: 2, delivery: 'failed' } }),
    card({ volunteerId: 'uid_sari', name: 'Sari', lastReportAt: '2026-10-17T03:05:00Z', lastSeverity: 'smoke', lastLat: -1.8495, lastLng: 110.0514, lastAccuracyM: 22, distanceM: 63, reportCount: 1,
      withdraw: { ...empty, sentAt: '2026-10-17T03:08:00Z', heardAt: '2026-10-17T03:08:20Z', sendCount: 1, delivery: 'sent', safe: true, safeAt: '2026-10-17T03:09:00Z', safeBy: { id: 'uid_maya', name: 'Bu Maya' } } }),
    card({ volunteerId: 'uid_ayu', name: 'Ayu', reportCount: 2, lastReportAt: '2026-10-17T03:06:00Z', lastSeverity: 'smoke', lastLat: -1.8501, lastLng: 110.0512, lastAccuracyM: null, distanceM: 111 }),
  ]
  d.timeline = [
    { kind: 'report', id: 'obs_demo_01', at: '2026-10-17T03:02:00Z', action: null, actorId: 'uid_dedi', actorName: 'Dedi', volunteerId: 'uid_dedi', taskId: null, severity: 'small_flame', source: 'chip', chip: 'api', text: 'Api kecil di parit' },
    { kind: 'audit', id: 'aud_w', at: '2026-10-17T03:08:00Z', action: 'task.withdraw', actorId: 'code', actorName: null, volunteerId: null, taskId: null, severity: null, source: null, chip: null, text: null },
    { kind: 'audit', id: 'aud_s', at: '2026-10-17T03:09:00Z', action: 'withdraw.safe', actorId: 'uid_maya', actorName: 'Bu Maya', volunteerId: 'uid_sari', taskId: null, severity: null, source: null, chip: null, text: null },
    { kind: 'audit', id: 'aud_h', at: '2026-10-17T03:08:20Z', action: 'task.heard', actorId: 'uid_sari', actorName: null, volunteerId: 'uid_sari', taskId: 'task_demo_withdraw_sari', severity: null, source: null, chip: null, text: null },
  ]
  d.summary = { english: 'Two reports disagree.', bahasa: 'Dua laporan berbeda.', source: 'template', at: '2026-10-17T03:06:00Z' }
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

describe('card lines', () => {
  it('say the distance from the incident centre, and nothing without a report', () => {
    expect(distanceLine('en', card({ distanceM: 111 }))).toBe('111 m from the incident centre')
    expect(distanceLine('id', card({ distanceM: 0 }))).toBe('0 m dari pusat insiden')
    expect(distanceLine('en', card({ distanceM: null }))).toBeNull()
    expect(distanceLine('en', null)).toBeNull()
  })

  it('give the last reported place with its accuracy only when one exists', () => {
    expect(placeLine(card())).toBe('-1.849, 110.051 · ±15 m')
    expect(placeLine(card({ lastAccuracyM: null }))).toBe('-1.849, 110.051')
    expect(placeLine(card({ lastLat: null, lastLng: null }))).toBeNull()
    expect(placeLine(card({ lastLat: Number.NaN }))).toBeNull()
    expect(placeLine(null)).toBeNull()
  })

  it('report heard, push result and resends, and say "not heard" rather than guess', () => {
    expect(deliveryFacts('en', card())).toEqual([])
    const base = { ...empty, sentAt: '2026-10-17T03:08:00Z' }
    expect(deliveryFacts('en', card({ withdraw: { ...base, delivery: 'failed', sendCount: 3 } }))).toEqual(['Not heard on device yet', 'Push failed', '3×'])
    expect(deliveryFacts('en', card({ withdraw: { ...base, heardAt: '2026-10-17T03:08:20Z', delivery: 'sent', sendCount: 1 } }))).toEqual([`Heard on device ${formatTimeZone('2026-10-17T03:08:20Z')}`, 'Push sent'])
    expect(deliveryFacts('id', card({ withdraw: { ...base, delivery: 'skipped' } }))).toEqual(['Belum terdengar di ponsel', 'Tanpa token perangkat, notifikasi dilewati'])
  })

  it('say who marked a volunteer safe and when, leaving out what was not stored', () => {
    const safe = { ...empty, safe: true }
    expect(safeStamp('en', card({ withdraw: { ...safe, safeAt: '2026-10-17T03:09:00Z', safeBy: { id: 'uid_maya', name: 'Bu Maya' } } }))).toBe(`Marked safe ${formatTimeZone('2026-10-17T03:09:00Z')} · by Bu Maya`)
    expect(safeStamp('en', card({ withdraw: { ...safe, safeAt: null, safeBy: null } }))).toBe('Marked safe')
    expect(safeStamp('en', card({ withdraw: { ...safe, safeAt: null, safeBy: { id: 'uid_maya', name: null } } }))).toBe('Marked safe')
    expect(safeStamp('en', card({ withdraw: empty }))).toBeNull()
    expect(safeStamp('en', card())).toBeNull()
  })

  it('choose the summary in the supervisor language and fall back to the other', () => {
    const s = { english: 'Two reports.', bahasa: '  ', source: 'model' as const, at: null }
    expect(summaryText('en', s)).toBe('Two reports.')
    expect(summaryText('id', s)).toBe('Two reports.')
    expect(summaryText('id', { ...s, english: null, bahasa: 'Dua laporan.' })).toBe('Dua laporan.')
    expect(summaryText('en', { ...s, english: null, bahasa: null })).toBeNull()
    expect(summaryText('en', null)).toBeNull()
    expect(summaryText('en', undefined)).toBeNull()
    expect(summarySourceText('en', s)).toBe('reworded by a model')
    expect(summarySourceText('en', { ...s, source: null })).toBeNull()
  })

  it('word every audit action in both languages', () => {
    const actions = Object.keys(timelineCopy.action) as AuditAction[]
    expect(actions).toHaveLength(16)
    for (const action of actions) {
      expect(timelineCopy.action[action].en.length).toBeGreaterThan(3)
      expect(timelineCopy.action[action].id.length).toBeGreaterThan(3)
    }
  })

  it('name who did a timeline action: code, the stored name, the volunteer for a receipt, else "Supervisor"', () => {
    const d = withExtras()
    const [, withdraw, safe, heard] = d.timeline as TimelineEntry[]
    expect(actorOf(d, withdraw, 'en')).toBe('Code')
    expect(actorOf(d, safe, 'en')).toBe('Bu Maya')
    expect(actorOf(d, heard, 'en')).toBe('Sari')
    expect(actorOf(d, { ...safe, actorName: null }, 'id')).toBe('Supervisor')
    expect(actionText('en', safe)).toBe('marked a volunteer safe')
    expect(subjectOf(d, safe, 'en')).toBe('Sari')
    expect(subjectOf(d, heard, 'en')).toBeNull()
    expect(subjectOf(d, withdraw, 'en')).toBeNull()
  })
})

describe('the volunteers the cards add', () => {
  it('finds a volunteer the conflict hides, with their count, name and last report', () => {
    const d = withExtras()
    expect(d.observations.some((o) => o.volunteerId === 'uid_ayu')).toBe(false)
    const ayu = volunteersOf(d).find((r) => r.id === 'uid_ayu')!
    expect([ayu.name, ayu.reportCount, ayu.latest, ayu.card?.distanceM]).toEqual(['Ayu', 2, null, 111])
    expect(nameOf(d, 'uid_ayu', 'en')).toBe('Ayu')
    expect(volunteersOf(d).map((r) => r.id)).toEqual(['uid_ayu', 'uid_sari', 'uid_dedi'])
  })

  it('keeps the old behaviour when the API sends no cards', () => {
    const d = fixture('withdraw')
    const rows = volunteersOf(d)
    expect(rows.map((r) => [r.id, r.reportCount, r.card])).toEqual([['uid_sari', 1, null], ['uid_dedi', 1, null]])
    expect(nameOf(d, 'uid_ayu', 'en')).toBe('Volunteer _AYU')
  })

  it('takes the larger of the local and the stored count, and shows a stored name only when none is local', () => {
    const d = withExtras()
    d.volunteers = [card({ reportCount: 5, name: 'Someone else' })]
    const dedi = volunteersOf(d).find((r) => r.id === 'uid_dedi')!
    expect([dedi.reportCount, dedi.name]).toEqual([5, 'Dedi'])
  })

  it('give the pop-up a volunteer only the card knows, with the card position and distance', () => {
    const p = popupFor(withExtras(), 'uid_ayu', 'en')!
    expect(p.profile).toMatchObject({ name: 'Ayu', reportCount: 2, lastReportAt: '2026-10-17T03:06:00Z', position: '-1.850, 110.051', accuracyM: null, distance: '111 m from the incident centre' })
    expect(p.reports).toEqual([])
    expect(popupFor(withExtras(), 'uid_ghost', 'en')).toBeNull()
    const html = renderToStaticMarkup(<VolunteerPopup lang="en" detail={withExtras()} volunteerId="uid_ayu" onClose={() => undefined} offline={false} now={NOW} sendInstruction={async () => { throw new Error('unused') }} photoUrl={async () => { throw new Error('unused') }} />)
    expect(html).toContain('111 m from the incident centre')
    expect(html).toContain('Ayu')
  })

  it('leave a volunteer without a report and without a card as before', () => {
    const d = fixture('conflict')
    expect(popupFor(d, 'uid_dedi', 'en')!.profile.distance).toBeNull()
  })
})

describe('withdraw people carry their card', () => {
  it('attaches the card, and none from an older API', () => {
    const people = withdrawState(withExtras())!.people
    expect(people.map((p) => [p.id, p.card?.withdraw?.delivery ?? null])).toEqual([['uid_dedi', 'failed'], ['uid_sari', 'sent']])
    expect(withdrawState(fixture('withdraw'))!.people.every((p) => p.card === null)).toBe(true)
  })
})

describe('incident detail with the supervisor extras', () => {
  it('counts every report and every reporter, not only the two sides of the conflict', () => {
    const html = view(withExtras())
    expect(html).toContain('aria-label="REPORTS"')
    expect(html).toMatch(/aria-label="REPORTS"[^]*?inc-stat-value[^>]*>4</)
    expect(html).toContain('3 volunteers')
  })

  it('shows the third volunteer card with the distance and the last place', () => {
    const html = view(withExtras())
    expect(html).toContain('aria-label="Ayu"')
    expect(html).toContain('111 m from the incident centre')
    expect(html).toContain('-1.850, 110.051')
    expect(html).toContain('Smoke')
  })

  it('shows on the unconfirmed volunteer when the report came, whether the phone heard it and the push result', () => {
    const html = view(withExtras())
    expect(html).toContain(`Last report ${formatTimeZone('2026-10-17T03:02:00Z')}`)
    expect(html).toContain('Not heard on device yet · Push failed · 2×')
  })

  it('shows who marked a volunteer safe and when, on their card', () => {
    expect(view(withExtras())).toContain(`Marked safe ${formatTimeZone('2026-10-17T03:09:00Z')} · by Bu Maya`)
  })

  it('draws the stored timeline: reports and actions, with who did them', () => {
    const html = view(withExtras())
    expect(html).toContain('Reports and actions, from the stored records')
    expect(html).toContain('Code · sent WITHDRAW')
    expect(html).toContain('Bu Maya · marked a volunteer safe · Sari')
    expect(html).toContain('Sari · instruction heard on device')
    expect(html).toContain('“Api kecil di parit”')
  })

  it('says so when the stored timeline is empty', () => {
    const d = withExtras()
    d.timeline = []
    expect(view(d)).toContain('No reports yet.')
  })

  it('shows the advisory summary in the language chosen, and not when none is stored', () => {
    expect(view(withExtras())).toContain('Two reports disagree.')
    expect(view(withExtras(), 'id')).toContain('Dua laporan berbeda.')
    expect(view(withExtras())).toContain('advisory · not the incident severity · template from the facts')
    const none = withExtras()
    none.summary = null
    expect(view(none)).not.toContain('SUMMARY')
  })

  it('draws the same screen as before from an older API that sends none of it', () => {
    const html = view(fixture('withdraw'))
    expect(html).toContain('From volunteer reports')
    expect(html).not.toContain('Reports and actions')
    expect(html).not.toContain('from the incident centre')
    expect(html).not.toContain('SUMMARY')
    expect(html).not.toContain('Heard on device')
  })

  it('writes in Bahasa too and adds no control that clears a withdraw', () => {
    const html = view(withExtras(), 'id')
    expect(html).toContain('111 m dari pusat insiden')
    expect(html).toContain('Kode · mengirim MUNDUR')
    expect(html).not.toMatch(/cancel withdraw|clear withdraw|batalkan mundur/i)
  })
})

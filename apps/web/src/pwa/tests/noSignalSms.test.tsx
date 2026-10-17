import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { OutboxItem } from '../outbox/types'
import { NoSignalCard } from '../screens/NoSignalCard'
import { ageMinutes, safetyFirst, STALE_AFTER_MS } from '../screens/noSignal'
import { SmsView } from '../screens/SmsScreen'
import { buildSms, incidentCodeOf, smsHref } from '../screens/sms'
import { digest, fakeBrowser, incident, outboxHandle, renderVolunteer, task, volunteerValue } from './volunteerKit'

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ signOut: async () => undefined, user: null, me: null }) }))

import { PhoneLayout } from '../layout/PhoneLayout'

fakeBrowser()

const NOW = Date.parse('2026-10-16T08:35:00Z')
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString()
const render = (el: JSX.Element, lang: 'id' | 'en' = 'en') => renderVolunteer(el, { path: '/pwa', lang, value: volunteerValue() })
const queuedItem = (over: Partial<OutboxItem> = {}): OutboxItem => ({ id: 'q1', body: null, photo: null, state: 'queued', attempts: 0, lastError: null, queuedAt: '2026-10-16T08:30:00Z', sentAt: null, observationId: null, ...over })

describe('how old the instruction is (#150)', () => {
  it('counts whole minutes from the cached send time', () => {
    expect(ageMinutes(at(12), NOW)).toBe(12)
    expect(ageMinutes(at(0), NOW)).toBe(0)
    expect(ageMinutes(null, NOW)).toBeNull()
    expect(ageMinutes('not a time', NOW)).toBeNull()
  })

  it('puts the safety rule first from 15 minutes, and when the age is unknown', () => {
    expect(safetyFirst(at(14), NOW)).toBe(false)
    expect(safetyFirst(at(15), NOW)).toBe(true)
    expect(safetyFirst(null, NOW)).toBe(true)
    expect(STALE_AFTER_MS).toBe(900_000)
  })
})

describe('the no-signal card (#150)', () => {
  const card = (over: Partial<Parameters<typeof NoSignalCard>[0]> = {}, lang: 'id' | 'en' = 'en') =>
    render(<NoSignalCard lang={lang} sinceMs={new Date(2026, 9, 16, 14, 35).getTime()} batteryPct={64} task={task({ sentAt: at(12), instruction: 'Wet the ground along the west ditch.' })} queued={[]} nowMs={NOW} {...over} />, lang)

  it('says since when there is no signal, with the phone battery', () => {
    const html = card()
    expect(html).toContain('No signal since 14:35')
    expect(html).toContain('Battery 64 %')
  })

  it('shows the last instruction with its time and age, instruction first while it is fresh', () => {
    const html = card()
    expect(html).toContain('LAST INSTRUCTION')
    expect(html).toContain('12 MIN AGO')
    expect(html).toContain('Wet the ground along the west ditch.')
    expect(html.indexOf('no-signal-instruction')).toBeLessThan(html.indexOf('no-signal-rule'))
    expect(html).not.toContain('safety rule first, then this')
  })

  it('puts the safety rule first when the instruction is older than 15 minutes', () => {
    const html = card({ task: task({ sentAt: at(40), instruction: 'Old one' }) })
    expect(html.indexOf('no-signal-rule')).toBeLessThan(html.indexOf('no-signal-instruction'))
    expect(html).toContain('safety rule first, then this')
  })

  it('says there is no instruction rather than inventing one, and treats it as stale', () => {
    const html = card({ task: null })
    expect(html).toContain('No instruction in the last data.')
    expect(html.indexOf('no-signal-rule')).toBeLessThan(html.indexOf('no-signal-instruction'))
  })

  it('counts the reports waiting in the outbox and leaves out sent ones', () => {
    const html = card({ queued: [queuedItem(), queuedItem({ id: 'q2' }), queuedItem({ id: 'q3', state: 'sent' })] })
    expect(html).toContain('2 reports saved with time and GPS')
    expect(html).toContain('They send by themselves when signal returns.')
    expect(card()).toContain('No reports saved')
  })

  it('links to the SMS fallback and shows no wind or signal spot it does not have', () => {
    const html = card()
    expect(html).toMatch(/<a[^>]*href="\/pwa\/sms"[^>]*data-testid="no-signal-sms"|<a[^>]*data-testid="no-signal-sms"[^>]*href="\/pwa\/sms"/)
    expect(html).not.toMatch(/Last known wind|Signal spot|school gate/i)
  })

  it('speaks Bahasa first', () => {
    expect(card({}, 'id')).toContain('Tidak ada sinyal sejak 14:35')
  })
})

describe('the SMS text (#151)', () => {
  const at0 = new Date(2026, 9, 16, 14, 44)
  const fix = { kind: 'ok' as const, lat: -0.8712, lng: 102.7134, accuracyM: 12 }

  it('is filled from the name, incident code, time and the phone’s own fix', () => {
    expect(buildSms({ kind: 'help', name: 'Pak Dedi', incidentCode: 'TOHOR-3', at: at0, position: fix })).toBe(
      'EMBER BUTUH BANTUAN · PAK DEDI · TOHOR-3 · 14:44 · -0.8712, 102.7134 (±12 M) · TIDAK ADA SINYAL DATA.',
    )
  })

  it('has one opening word per kind', () => {
    const word = (kind: 'help' | 'safe' | 'spreading') => buildSms({ kind, name: null, incidentCode: null, at: at0, position: fix })
    expect(word('safe')).toContain('EMBER AMAN')
    expect(word('spreading')).toContain('EMBER API MENYEBAR')
  })

  it('leaves out a name or incident it does not have and says when there is no fix', () => {
    const text = buildSms({ kind: 'help', name: ' ', incidentCode: null, at: at0, position: { kind: 'unavailable' } })
    expect(text).toBe('EMBER BUTUH BANTUAN · 14:44 · LOKASI TIDAK TERSEDIA · TIDAK ADA SINYAL DATA.')
    expect(text).not.toMatch(/\d\.\d{4}/)
  })

  it('opens the phone’s SMS app with the text, and with recipients only when there are some', () => {
    expect(smsHref('EMBER AMAN · 14:44')).toBe('sms:?&body=EMBER%20AMAN%20%C2%B7%2014%3A44')
    expect(smsHref('x', ['+62 812 1234', ' '])).toBe('sms:+628121234?&body=x')
  })

  it('takes the incident code from the name', () => {
    expect(incidentCodeOf('TOHOR-3 · Desa Tohor · #1')).toBe('TOHOR-3')
    expect(incidentCodeOf(null)).toBeNull()
    expect(incidentCodeOf('')).toBeNull()
  })

  it('fills the API template using the phone time and coordinates', () => {
    const body = buildSms({ kind: 'safe', name: 'Sari', incidentCode: null, at: at0, position: fix, template: '{status} · {name} · {incidentCode} · {time} · {location}' })
    expect(body).toBe('AMAN · SARI · 14:44 · -0.8712, 102.7134 (±12 M)')
  })
})

describe('the SMS screen (#151)', () => {
  const view = (position = { kind: 'ok', lat: 1, lng: 2, accuracyM: 5 } as never, kind: 'help' | 'safe' | 'spreading' = 'help') =>
    render(<SmsView lang="en" kind={kind} onKind={() => undefined} body="EMBER BUTUH BANTUAN · 14:44" position={position} onBack={() => undefined} />)

  it('shows the message, the three kinds and an Open SMS app link that carries the message', () => {
    const html = view()
    expect(html).toContain('Send by SMS')
    expect(html).toContain('EMBER BUTUH BANTUAN · 14:44')
    for (const k of ['help', 'safe', 'spreading']) expect(html).toContain(`data-testid="sms-kind-${k}"`)
    expect(html).toMatch(/href="sms:\?&amp;body=EMBER%20BUTUH%20BANTUAN/)
    expect(html).toContain('aria-checked="true"')
  })

  it('does not invent the crew lead or duty line numbers, and says replies are read by a person', () => {
    const html = view()
    expect(html).toContain('not in the app yet')
    expect(html).not.toMatch(/\+62|Sari|BPBD/)
    expect(html).toContain('a person reads them')
  })

  it('warns when the phone has no location yet', () => {
    expect(view({ kind: 'waiting' } as never)).toContain('data-testid="sms-no-location"')
    expect(view()).not.toContain('data-testid="sms-no-location"')
  })

  it('shows the last-known contacts and includes only selected recipients in the native draft', () => {
    const recipients = [
      { id: 'lead', name: 'Crew leader', role: 'crew_lead' as const, phone: '+6281212344410' },
      { id: 'duty', name: 'Duty desk', role: 'duty_line' as const, phone: '+62763123112' },
    ]
    const html = render(<SmsView lang="en" kind="safe" onKind={() => undefined} body="EMBER AMAN" position={{ kind: 'unavailable' }} onBack={() => undefined} recipients={recipients} selectedRecipients={['lead']} />)
    expect(html).toContain('Crew leader · crew lead')
    expect(html).toContain('Duty desk · BPBD duty line')
    expect(html).toContain('sms:+6281212344410?')
    expect(html).not.toContain('sms:+62763123112')
    expect(html).toContain('SMS needs cellular service')
    const empty = render(<SmsView lang="en" kind="help" onKind={() => undefined} body="HELP" position={{ kind: 'unavailable' }} onBack={() => undefined} recipients={recipients} selectedRecipients={[]} />)
    expect(empty).toContain('aria-disabled="true"')
    expect(empty).not.toContain('href="sms:')
  })
})

describe('Home and routes with no signal', () => {
  const layout = (path: string, over = {}) => renderVolunteer(<Routes><Route path="/pwa/*" element={<PhoneLayout />} /></Routes>, { path, value: volunteerValue(over) })

  it('shows the field card instead of the task card when offline, with the cached instruction', () => {
    const d = digest({ incidents: [incident()], myTasks: [task({ sentAt: '2026-10-16T08:00:00Z', instruction: 'Check the canal' })] })
    const html = layout('/pwa', { digest: d, outbox: outboxHandle({ online: false }) })
    expect(html).toContain('data-testid="home-offline"')
    expect(html).toContain('Check the canal')
    expect(html).not.toContain('TASK WAITING')
  })

  it('routes /pwa/sms inside the phone layout', () => {
    const html = layout('/pwa/sms')
    expect(html).toContain('Send by SMS')
    expect(html).toContain('data-testid="tab-home"')
  })

  it('provides SMS access offline even before any digest has loaded', () => {
    const html = layout('/pwa', { digest: null, digestStatus: 'loading', outbox: outboxHandle({ online: false }) })
    expect(html).toContain('data-testid="no-signal-sms"')
    expect(html).toContain('No instruction in the last data.')
    expect(html).not.toContain('home-skeleton')
  })

  it('offers SMS when data is unreachable even if the browser still reports online', () => {
    const html = layout('/pwa', { digestStatus: 'unreachable', outbox: outboxHandle({ online: true }) })
    expect(html).toContain('data-testid="no-signal-sms"')
    expect(html).not.toContain('TASK WAITING')
  })
})

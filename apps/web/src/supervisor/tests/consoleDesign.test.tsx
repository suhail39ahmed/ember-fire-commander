import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { formatTime } from '../../pwa/formatTime'
import type { IncidentDetail, Observation, VolunteerCardData } from '../contracts'
import { accuracyText, crewDistanceLine, isCoarse, linkLine, nameRole, placeLine } from '../detail/cardModel'
import { IncidentDetailView, type IncidentDetailViewProps } from '../detail/IncidentDetailView'
import { ReportCard } from '../detail/ReportCard'
import { VolunteerCard } from '../detail/VolunteerCard'
import { AskBox } from '../detail/AssistBlocks'
import type { AssistActions } from '../detail/assistModel'
import { VolunteerPopup } from '../detail/VolunteerPopup'
import { volunteersOf } from '../detail/model'
import { fixture } from '../fixtures'
import type { IncidentActions } from '../IncidentView'

const NOW = Date.parse('2026-10-17T03:10:00Z')
const actions: IncidentActions = { busyId: null, outcomes: {}, onApprove: () => undefined, onReject: () => undefined, saveEdit: async () => ({ task: fixture('normal').tasks[0], auditId: 'aud_1' } as never), onVerify: () => undefined }
const decision = { incident: fixture('normal').incident, auditId: 'aud_9' }

function view(detail: IncidentDetail, lang: 'id' | 'en' = 'en') {
  const props: IncidentDetailViewProps = {
    lang, incidentId: 'inc_demo_01', detail, queue: [detail.incident], failure: null, link: 'online', lastOkAt: NOW, now: NOW, actions,
    onRetry: () => undefined, onSelect: () => undefined, markSafe: async () => decision, resendTask: async () => ({ auditId: 'aud_3' }),
    sendWithdraw: async () => decision, actorName: 'Bu Maya', lowerSeverity: async () => decision, serverNow: () => NOW, extinguish: async () => decision,
    sendInstruction: async () => ({ task: fixture('normal').tasks[0], auditId: 'aud_i' }),
    photoUrl: async () => ({ url: 'https://photo.example/x.jpg', expiresAt: '2026-10-17T03:15:00Z' }),
  }
  return renderToStaticMarkup(<StaticRouter location="/console/incidents/inc_demo_01"><IncidentDetailView {...props} /></StaticRouter>)
}

function popup(detail: IncidentDetail, id: string, lang: 'id' | 'en' = 'en') {
  return renderToStaticMarkup(
    <VolunteerPopup
      lang={lang} detail={detail} volunteerId={id} onClose={() => undefined} offline={false} now={NOW}
      sendInstruction={async () => { throw new Error('unused') }} photoUrl={async () => { throw new Error('unused') }}
    />,
  )
}

const sari = (over: Partial<VolunteerCardData> = {}): VolunteerCardData => ({
  volunteerId: 'uid_sari', name: 'Sari', reportCount: 1, firstReportAt: '2026-10-17T03:05:00Z', lastReportAt: '2026-10-17T03:05:00Z', lastSeverity: 'smoke',
  lastLat: -1.849, lastLng: 110.051, lastAccuracyM: 22, distanceM: 63, lastHeardAt: null, pushReady: true, withdraw: null,
  crewName: 'Tim Pompa A', teamRole: 'crew lead', device: { batteryPct: 64, network: '4g', language: 'id', at: '2026-10-17T03:05:00Z' }, ...over,
})

describe('accuracy as a person reads it', () => {
  it('shows metres under a kilometre and kilometres above, never a six-figure number of metres', () => {
    expect(accuracyText(18)).toBe('±18 m')
    expect(accuracyText(999.4)).toBe('±999 m')
    expect(accuracyText(2400)).toBe('±2.4 km')
    expect(accuracyText(1497195)).toBe('±1497 km')
  })

  it('shows nothing when no accuracy was reported', () => {
    expect(accuracyText(null)).toBeNull()
    expect(accuracyText(undefined)).toBeNull()
    expect(accuracyText(Number.NaN)).toBeNull()
    expect(accuracyText(-1)).toBeNull()
  })

  it('calls a fix of 5 km or more coarse', () => {
    expect(isCoarse(4999)).toBe(false)
    expect(isCoarse(5000)).toBe(true)
    expect(isCoarse(1497195)).toBe(true)
    expect(isCoarse(null)).toBe(false)
  })

  it('writes the same units into the place line and a report card, and drops the "?" when none was sent', () => {
    expect(placeLine(sari({ lastAccuracyM: 1497195 }))).toBe('-1.849, 110.051 · ±1497 km')
    expect(placeLine(sari({ lastAccuracyM: null }))).toBe('-1.849, 110.051')
    const obs: Observation = { ...fixture('conflict').observations[0], accuracyM: 1497195 }
    expect(renderToStaticMarkup(<ReportCard lang="en" obs={obs} />)).toContain('±1497 km')
    expect(renderToStaticMarkup(<ReportCard lang="en" obs={{ ...obs, accuracyM: null }} />)).not.toContain('?')
  })
})

describe('volunteer card header lines', () => {
  it('reads "name · role", "crew · distance" and "network · battery" from stored values only', () => {
    expect(nameRole('Sari', sari())).toBe('Sari · crew lead')
    expect(nameRole('Sari', sari({ teamRole: null }))).toBe('Sari')
    expect(nameRole('Sari', null)).toBe('Sari')
    expect(crewDistanceLine('en', sari())).toBe('Tim Pompa A · 63 m from the incident centre')
    expect(crewDistanceLine('en', sari({ crewName: null }))).toBe('63 m from the incident centre')
    expect(crewDistanceLine('en', sari({ crewName: null, distanceM: null }))).toBeNull()
    expect(linkLine(sari())).toBe('4G · 64%')
    expect(linkLine(sari({ device: { batteryPct: null, network: 'wifi', language: null, at: null } }))).toBe('Wi-Fi')
    expect(linkLine(sari({ device: null }))).toBeNull()
    expect(linkLine(null)).toBeNull()
  })

  it('shows the raw position and the source line nowhere on the card, and only flags a coarse fix', () => {
    const detail: IncidentDetail = { ...fixture('conflict'), volunteers: [sari({ lastLat: -1.777, lastLng: 110.222 })] }
    const html = view(detail)
    expect(html).not.toContain('quick chip · ±')
    expect(html).not.toContain('-1.777, 110.222')
    expect(html).not.toContain('coarse location')
    const coarse = view({ ...detail, observations: detail.observations.map((o) => ({ ...o, accuracyM: 1497195 })) })
    expect(coarse).toContain('coarse location ±1497 km')
    expect(coarse).not.toContain('1497195')
  })

  it('has an Expand control, and marks the card on the live camera with an orange border class', () => {
    const row = volunteersOf(fixture('conflict'))[0]
    const live = { signal: '4g' as const, media: 'live' as const, photoCadence: null, canRetry: false, canMakeLive: false }
    expect(renderToStaticMarkup(<VolunteerCard lang="en" row={row} live={live} onOpen={() => undefined} />)).toContain('inc-vol on-live')
    expect(renderToStaticMarkup(<VolunteerCard lang="en" row={row} live={{ ...live, media: 'photo_60s', photoCadence: 'every_60s' }} onOpen={() => undefined} />)).not.toContain('on-live')
    expect(renderToStaticMarkup(<VolunteerCard lang="en" row={row} onOpen={() => undefined} />)).toContain('>Expand<')
  })

  it('heads the field section with the monospace subtitle, in both languages', () => {
    const detail: IncidentDetail = { ...fixture('conflict'), volunteers: [sari()] }
    expect(view(detail)).toContain('volunteers · one live camera at a time · others send a photo every 60 s')
    expect(view(detail, 'id')).toContain('relawan · satu kamera live dalam satu waktu · yang lain kirim foto tiap 60 dtk')
  })
})

describe('timeline and containers in the right rail', () => {
  it('writes each row as HH:MM · ACTOR · event with no subtitle, and no zone suffix to wrap', () => {
    const detail: IncidentDetail = {
      ...fixture('conflict'),
      timeline: [{ kind: 'action', id: 'a1', at: '2026-10-17T03:02:00Z', action: 'incident.verify', actorId: 'sup_1', actorName: 'Bu Maya', volunteerId: null, severity: null, chip: null, text: null } as never],
    }
    const html = view(detail)
    expect(html).toContain(`<time dateTime="2026-10-17T03:02:00Z" title="`)
    expect(html).toContain(`>${formatTime('2026-10-17T03:02:00Z')}</time>`)
    expect(html).toContain('<span class="inc-actor">Bu Maya</span> · verified the incident')
    expect(html).not.toContain('Reports and actions')
    expect(html).not.toContain('From volunteer reports')
    expect(html).not.toMatch(/<time[^>]*>[^<]*GMT/)
  })

  it('keeps the evidence breakdown and its not-a-probability line', () => {
    const html = view(fixture('conflict'))
    expect(html).toContain('not a probability')
  })

  it('puts a red dot before the WITHDRAW notice', () => {
    expect(view(fixture('conflict'))).toContain('<span class="inc-callout-dot" aria-hidden="true"></span>')
  })
})

describe('volunteer pop-up header', () => {
  it('titles it "name · role", puts a ✕ at the top right and a status line of stored facts', () => {
    const detail: IncidentDetail = { ...fixture('conflict'), volunteers: [sari()] }
    const html = popup(detail, 'uid_sari')
    expect(html).toContain('>Sari · crew lead</h2>')
    expect(html).toContain('<button type="button" class="inc-modal-x" aria-label="Close">✕</button>')
    expect(html).toContain('<span class="pop-status">63 m from the incident centre · 4G 64%</span>')
  })

  it('draws no status line, and no role, when nothing is stored', () => {
    const html = popup(fixture('conflict'), 'uid_sari')
    expect(html).toContain('>Sari</h2>')
    expect(html).not.toContain('pop-status')
  })

  it('shows a coarse position in kilometres in the profile', () => {
    const detail: IncidentDetail = { ...fixture('conflict'), observations: fixture('conflict').observations.map((o) => ({ ...o, accuracyM: 1497195 })) }
    const html = popup(detail, 'uid_sari')
    expect(html).toContain('±1497 km')
    expect(html).not.toContain('1497195')
  })

  it('offers the quick prompts, switched off while the chat is not connected', () => {
    const html = popup(fixture('conflict'), 'uid_sari')
    for (const label of ['What next?', 'Summarise last 5 min', 'Draft for everyone']) expect(html).toContain(`disabled="">${label}</button>`)
    expect(popup(fixture('conflict'), 'uid_sari', 'id')).toContain('Apa selanjutnya?')
  })
})

describe('quick prompts on the working Ask EMBER box', () => {
  const assist = {
    suggest: async () => undefined,
    translate: async () => undefined,
    ask: async () => ({ answer: 'x', enoughData: true, at: '2026-10-17T03:10:00Z' }),
  } as unknown as AssistActions

  it('draws them above the question box as enabled buttons that ask through the same box', () => {
    const html = renderToStaticMarkup(<AskBox lang="en" volunteerId="uid_sari" assist={assist} offline={false} />)
    for (const label of ['What next?', 'Summarise last 5 min', 'Draft for everyone']) expect(html).toContain(`<button type="button" class="pop-btn">${label}</button>`)
    expect(html.indexOf('pop-prompts')).toBeLessThan(html.indexOf('class="pop-input"'))
    expect(renderToStaticMarkup(<AskBox lang="id" volunteerId="uid_sari" assist={assist} offline={false} />)).toContain('Apa selanjutnya?')
  })

  it('switches them off while offline, like the box', () => {
    const html = renderToStaticMarkup(<AskBox lang="en" volunteerId="uid_sari" assist={assist} offline />)
    expect(html).toContain('disabled="">What next?</button>')
  })
})

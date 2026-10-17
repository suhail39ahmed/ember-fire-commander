import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { formatTime, formatTimeZone } from '../../pwa/formatTime'
import type { IncidentDetail, Observation } from '../contracts'
import { fixture } from '../fixtures'
import type { IncidentActions } from '../IncidentView'
import { IncidentDetailView } from '../detail/IncidentDetailView'
import { popupCopy } from '../detail/popupCopy'
import { popupFor } from '../detail/popupModel'
import { VolunteerCard } from '../detail/VolunteerCard'
import { VolunteerPopup } from '../detail/VolunteerPopup'
import { volunteersOf } from '../detail/model'

const NOW = Date.parse('2026-10-17T03:10:00Z')

function withPhoto(detail: IncidentDetail): IncidentDetail {
  const photo: Observation = {
    id: 'obs_photo', volunteerId: 'uid_sari', capturedAt: '2026-10-17T03:07:00Z', receivedAt: '2026-10-17T03:07:03Z', source: 'photo',
    lat: -1.85, lng: 110.06, accuracyM: 9, chip: null, text: 'Foto parit', severity: 'smoke', photoPath: 'photos/uid_sari/obs_photo.jpg', immutable: true,
  }
  return { ...detail, observations: [...detail.observations, photo] }
}

const wiring = {
  offline: false,
  now: Date.parse('2026-10-17T03:10:00Z'),
  sendInstruction: async () => { throw new Error('not used in a static render') },
  photoUrl: async () => { throw new Error('not used in a static render') },
}

function popup(detail: IncidentDetail, id: string, lang: 'id' | 'en' = 'en') {
  return renderToStaticMarkup(<VolunteerPopup lang={lang} detail={detail} volunteerId={id} onClose={() => undefined} {...wiring} />)
}

describe('volunteer pop-up: the data', () => {
  it('reads one volunteer from the incident detail and nothing else', () => {
    const p = popupFor(withPhoto(fixture('conflict')), 'uid_sari', 'en')!
    expect(p.profile).toMatchObject({ id: 'uid_sari', name: 'Sari', initials: 'SA', incidentId: 'inc_demo_01', reportCount: 2 })
    expect(p.reports.map((o) => o.id)).toEqual(['obs_photo', 'obs_demo_02'])
    expect(p.photos.map((o) => o.id)).toEqual(['obs_photo'])
    expect(p.tasks.map((t) => t.volunteerId)).toEqual(['uid_sari'])
    expect(p.profile.firstReportAt).toBe('2026-10-17T03:05:00Z')
    expect(p.profile.lastReportAt).toBe('2026-10-17T03:07:00Z')
    expect(p.profile.position).toBe('-1.850, 110.060')
    expect(p.profile.accuracyM).toBe(9)
  })

  it('knows a volunteer who only has a task or a withdraw entry, and not a stranger', () => {
    const d = fixture('conflict')
    d.observations = d.observations.filter((o) => o.volunteerId !== 'uid_sari')
    const p = popupFor(d, 'uid_sari', 'en')!
    expect(p.reports).toEqual([])
    expect(p.profile.position).toBeNull()
    expect(popupFor(d, 'uid_ghost', 'en')).toBeNull()
  })

  it('marks a volunteer on the active withdraw', () => {
    expect(popupFor(fixture('withdraw'), 'uid_dedi', 'en')!.withdrawn).toBe(true)
    expect(popupFor(fixture('conflict'), 'uid_dedi', 'en')!.withdrawn).toBe(false)
  })
})

describe('volunteer pop-up: every region of the frame is there', () => {
  const regions = ['Live video', 'Transcript', 'Snapshots saved to the incident', 'Sent to Sari', 'Profile', 'AI suggested', 'Ask EMBER AI about Sari', 'Send to this volunteer']

  it.each(regions)('has the %s region', (label) => {
    expect(popup(withPhoto(fixture('conflict')), 'uid_sari')).toContain(`aria-label="${label}"`)
  })

  it('speaks Bahasa in every region', () => {
    const html = popup(fixture('conflict'), 'uid_sari', 'id')
    for (const label of ['Video langsung', 'Transkrip', 'Foto tersimpan di insiden', 'Dikirim ke Sari', 'Profil', 'Saran AI', 'Tanya EMBER AI tentang Sari', 'Kirim ke relawan ini']) {
      expect(html).toContain(`aria-label="${label}"`)
    }
    expect(html).toContain('>Tutup<')
  })

  it('shows the profile values the API has and leaves out the rest', () => {
    const html = popup(fixture('conflict'), 'uid_sari')
    expect(html).toContain('<dt>Position</dt><dd>-1.849, 110.051 · ±22 m</dd>')
    expect(html).toContain(`<dt>First report</dt><dd>${formatTimeZone('2026-10-17T03:05:00Z')}</dd>`)
    expect(html).toContain('<dt>Incident</dt><dd>Ketapang, Kalimantan Barat · Pak Dedi · #1</dd>')
    for (const label of ['Role', 'Network', 'Battery', 'Language', 'Last heard']) expect(html).not.toContain(`<dt>${label}</dt>`)
    expect(html).not.toContain('<dd>—</dd>')
    expect(html).toContain('No report from this volunteer has carried network, battery or language yet.')
  })

  it('lists the volunteer’s reports in their own words and their instructions with their status', () => {
    const html = popup(fixture('conflict'), 'uid_sari')
    expect(html).toContain('“Saya lihat asap saja, tidak ada api.”')
    expect(html).toContain('>Verify</p>')
    expect(html).toContain('waiting for approval')
    expect(html).not.toContain('Api kecil di parit belakang kebun')
  })

  it('lists photo reports by time and volunteer, asking for the signed link and never printing the storage path', () => {
    const html = popup(withPhoto(fixture('conflict')), 'uid_sari')
    expect(html).toContain(`${formatTime('2026-10-17T03:07:00Z')} · SARI`)
    expect(html).toContain('Loading photo…')
    expect(html).not.toContain('photos/uid_sari')
  })

  it('says plainly what no service stores or does yet, region by region', () => {
    const html = popup(fixture('conflict'), 'uid_sari')
    expect(html).toContain('ember-api does not store an English translation yet')
    expect(html).toContain('Not available yet</b> · Needs streaming video pixels from voice-gateway to the console')
    expect(html).toContain('Needs an endpoint in agents that answers questions, plus a thread and instruction drafts')
    expect(html).toContain('The agents service has no endpoint that answers questions')
    expect(html).toContain('No service writes free-form advice with a rationale.')
    expect(html).not.toContain('Needs a route that sends an instruction')
    expect(html).not.toContain('Send time and heard status are not stored yet')
  })

  it('offers a send form for this one volunteer, while the chat and the send-to-all box stay off', () => {
    const html = popup(fixture('conflict'), 'uid_sari')
    expect(html).toMatch(/<textarea[^>]*aria-label="Instruction"/)
    expect(html).not.toMatch(/<textarea[^>]*disabled/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Send<\/button>/) // empty text: nothing to send
    expect(html).toContain('One volunteer per send.')
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*placeholder="Ask EMBER AI, or tell it what to send…"/)
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*disabled=""/)
    for (const label of ['Mic', 'Video', 'Snapshot', 'Flip camera', 'End live']) expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${label}</button>`))
  })

  it('says WITHDRAW is never held up by it, and marks a withdrawn volunteer', () => {
    const html = popup(fixture('withdraw'), 'uid_dedi')
    expect(html).toContain('WITHDRAW never waits on this chat and cannot be blocked here.')
    expect(html).toContain('WITHDRAW sent')
  })

  it('has a Close and says so when the volunteer is no longer on the incident', () => {
    expect(popup(fixture('conflict'), 'uid_sari')).toContain('>Close<')
    const gone = popup(fixture('conflict'), 'uid_ghost')
    expect(gone).toContain('no longer on this incident')
    expect(gone).toContain('role="alert"')
  })

  it('has every label in both languages', () => {
    for (const [key, value] of Object.entries(popupCopy)) {
      expect(value.en, key).toBeTruthy()
      expect(value.id, key).toBeTruthy()
    }
  })
})

describe('volunteer pop-up: where it opens', () => {
  it('puts an Expand button on each volunteer card', () => {
    const row = volunteersOf(fixture('conflict'))[0]
    expect(renderToStaticMarkup(<VolunteerCard lang="en" row={row} onOpen={() => undefined} />)).toContain('aria-label="Expand Sari"')
    expect(renderToStaticMarkup(<VolunteerCard lang="en" row={row} />)).not.toContain('>Expand<')
  })

  it('keeps the incident detail as it is while closed', () => {
    // Only the shape the view reads while no task is decided here.
    const noop = { busyId: null, outcomes: {}, onApprove: () => undefined, onReject: () => undefined, onVerify: () => undefined } as unknown as IncidentActions
    const d = fixture('conflict')
    const html = renderToStaticMarkup(
      <StaticRouter location="/console/incidents/inc_demo_01">
        <IncidentDetailView
          lang="en" incidentId="inc_demo_01" detail={d} queue={[d.incident]} failure={null} link="online" lastOkAt={NOW} now={NOW} actions={noop}
          onRetry={() => undefined} onSelect={() => undefined} sendWithdraw={async () => ({ incident: d.incident, auditId: 'a' })} actorName="Bu Maya"
          serverNow={() => NOW} lowerSeverity={async () => ({ incident: d.incident, auditId: 'a' })} extinguish={async () => ({ incident: d.incident, auditId: 'a' })} markSafe={async () => ({ incident: d.incident, auditId: 'a' })} resendTask={async () => ({ auditId: 'a' })}
          sendInstruction={async () => ({ task: d.tasks[0], auditId: 'a' })} photoUrl={async () => ({ url: 'https://photo.example/x.jpg', expiresAt: '2026-10-17T03:15:00Z' })}
        />
      </StaticRouter>,
    )
    expect(html).not.toContain('role="dialog"')
    expect(html.match(/aria-label="Expand (Sari|Dedi)"/g)).toHaveLength(2)
  })
})

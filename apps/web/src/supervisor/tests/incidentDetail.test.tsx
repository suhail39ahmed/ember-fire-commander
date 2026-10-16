import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { formatTime } from '../../pwa/formatTime'
import type { IncidentDetail } from '../contracts'
import { fixture } from '../fixtures'
import type { IncidentActions } from '../IncidentView'
import { IncidentDetailView, type IncidentDetailViewProps } from '../detail/IncidentDetailView'
import { Modal } from '../detail/Modal'
import {
  formatPosition, highestReport, initialsOf, lastTaskFor, linkState, minutesBetween, timelineOf, volunteerLabel, volunteersOf,
} from '../detail/model'

const noop: IncidentActions = {
  busyId: null,
  outcomes: {},
  onApprove: () => undefined,
  onReject: () => undefined,
  onEdit: () => undefined,
  onVerify: () => undefined,
}

const NOW = Date.parse('2026-10-17T03:10:00Z')

function view(over: Partial<IncidentDetailViewProps> = {}, lang: 'id' | 'en' = 'en') {
  const detail = over.detail === undefined ? fixture('conflict') : over.detail
  const props: IncidentDetailViewProps = {
    lang,
    incidentId: 'inc_demo_01',
    detail,
    queue: detail ? [detail.incident] : null,
    failure: null,
    link: 'online',
    lastOkAt: NOW - 2 * 60000,
    now: NOW,
    actions: noop,
    onRetry: () => undefined,
    onSelect: () => undefined,
    sendWithdraw: async () => ({ incident: fixture('normal').incident, auditId: 'aud_1' }),
    actorName: 'Bu Maya',
    lowerSeverity: async () => ({ incident: fixture('normal').incident, auditId: 'aud_1' }),
    serverNow: () => NOW,
    extinguish: async () => ({ incident: fixture('normal').incident, auditId: 'aud_1' }),
    ...over,
  }
  return renderToStaticMarkup(
    <StaticRouter location="/console/incidents/inc_demo_01">
      <IncidentDetailView {...props} />
    </StaticRouter>,
  )
}

describe('incident detail model', () => {
  it('labels a volunteer from the id, with a short fallback for a real uid', () => {
    expect(volunteerLabel('uid_dedi', 'en')).toBe('Dedi')
    expect(volunteerLabel('x8KdPq2LmZ7hLm', 'en')).toBe('Volunteer 7HLM')
    expect(volunteerLabel('x8KdPq2LmZ7hLm', 'id')).toBe('Relawan 7HLM')
    expect(initialsOf('Dedi')).toBe('DE')
    expect(initialsOf('Pak Dedi')).toBe('PD')
    expect(initialsOf('')).toBe('?')
  })

  it('lists every volunteer the incident knows once, newest report first', () => {
    const rows = volunteersOf(fixture('conflict'))
    expect(rows.map((r) => r.id)).toEqual(['uid_sari', 'uid_dedi'])
    expect(rows[0].reportCount).toBe(1)
    expect(rows.every((r) => r.latest !== null)).toBe(true)
  })

  it('includes task and withdraw recipients that have no report', () => {
    const detail = fixture('normal')
    detail.tasks.push({ id: 't_x', incidentId: 'inc_demo_01', volunteerId: 'uid_rizal', type: 'verify', status: 'proposed', instruction: 'Look again' })
    detail.incident.withdraw = { active: true, instruction: 'Withdraw', reasons: [], volunteerIds: ['uid_ani'] }
    const rows = volunteersOf(detail)
    expect(rows.map((r) => r.id).sort()).toEqual(['uid_ani', 'uid_dedi', 'uid_rizal'])
    expect(rows.find((r) => r.id === 'uid_ani')).toMatchObject({ reportCount: 0, latest: null, withdrawn: true })
    expect(rows.find((r) => r.id === 'uid_rizal')?.withdrawn).toBe(false)
  })

  it('picks the withdraw task, then approved, then proposed, then rejected', () => {
    const mk = (id: string, type: 'verify' | 'withdraw' | 'investigate', status: 'proposed' | 'approved' | 'rejected') =>
      ({ id, incidentId: 'i', volunteerId: 'uid_a', type, status, instruction: id })
    const tasks = [mk('p', 'verify', 'proposed'), mk('w', 'withdraw', 'approved'), mk('a', 'verify', 'approved'), mk('r', 'verify', 'rejected')]
    expect(lastTaskFor(tasks, 'uid_a')?.id).toBe('w')
    expect(lastTaskFor(tasks.filter((t) => t.id !== 'w'), 'uid_a')?.id).toBe('a')
    expect(lastTaskFor([tasks[0], tasks[3]], 'uid_a')?.id).toBe('p')
    expect(lastTaskFor(tasks, 'uid_none')).toBeNull()
  })

  it('finds the report at the incident severity and orders the timeline oldest first', () => {
    const detail = fixture('conflict')
    expect(highestReport(detail)?.volunteerId).toBe('uid_dedi')
    expect(timelineOf(detail).map((o) => o.id)).toEqual(['obs_demo_01', 'obs_demo_02'])
    expect(highestReport({ ...detail, observations: [] })).toBeNull()
  })

  it('formats the position and the link state', () => {
    expect(formatPosition({ lat: -1.849, lng: 110.051 })).toBe('-1.849, 110.051')
    expect(formatPosition({ lat: Number.NaN, lng: 1 })).toBe('—')
    expect(minutesBetween(0, 125000)).toBe(2)
    expect(minutesBetween(10, 5)).toBe(0)
    expect(linkState(true, null, 0)).toBe('lost')
    expect(linkState(false, 5000, 4000)).toBe('restored')
    expect(linkState(false, 5000, 5000)).toBe('online')
    expect(linkState(false, null, 0)).toBe('online')
  })
})

describe('incident detail: default', () => {
  it('shows the header, stat cards, one bulletin per volunteer and the timeline', () => {
    const html = view()
    expect(html).toContain('<h1 class="inc-title">Ketapang, Kalimantan Barat · Pak Dedi · #1</h1>')
    expect(html).toContain('HELD · CONFLICT')
    expect(html).toContain('DISPATCH ON HOLD')
    expect(html).toContain('ID inc_demo_01')
    expect(html).toContain('2 on site')
    expect(html).toContain('aria-label="SEVERITY"')
    expect(html).toContain('Highest report wins · Dedi · ' + formatTime('2026-10-17T03:02:00Z'))
    expect(html).toContain('aria-label="EVIDENCE"')
    expect(html).toContain('>64<')
    expect(html).toContain('-1.849, 110.051')
    expect(html).toContain('Live from the field')
    expect(html).toContain('aria-label="Sari"')
    expect(html).toContain('aria-label="Dedi"')
    expect(html).toContain('“Api kecil di parit belakang kebun”')
    expect(html).toContain('Not a probability')
    expect(html).toContain('<ol class="inc-timeline">')
    expect(html).toContain('href="/console" data-discover="true">← Incidents</a>')
    expect(html).toContain('href="/console/audit"')
  })

  it('shows each volunteer’s last task and its state without a heard time', () => {
    const html = view()
    expect(html).toContain('Foto lebih lebar ke arah tanah')
    expect(html).toContain('waiting for approval')
    expect(html).not.toContain('heard')
  })

  it('does not show raw ids as the incident name or a volunteer name', () => {
    const html = view()
    expect(html).not.toContain('uid_dedi')
    expect(html).not.toContain('uid_sari')
  })

  it('names an incident without a name by a short code', () => {
    const detail = fixture('normal')
    detail.incident = { ...detail.incident, id: '4kQ9xZ7hLm', name: null }
    const html = view({ detail, incidentId: '4kQ9xZ7hLm' })
    expect(html).toContain('<h1 class="inc-title">INC-7HLM</h1>')
  })

  it('keeps Verify and the task decisions that existed before', () => {
    const html = view()
    expect(html).toContain('Verify incident')
    expect(html).toContain('>Approve<')
    expect(html).toContain('>Reject<')
    expect(html).toContain('Reports disagree')
    expect(html).toContain('Dispatch is held until the conflict is resolved.')
  })

  it('shows the withdraw banner and marks the volunteers it went to', () => {
    const html = view({ detail: fixture('withdraw') })
    expect(html).toContain('role="alert" aria-live="assertive"')
    expect(html).toContain('MUNDUR sekarang ke titik kumpul')
    expect(html).toContain('WITHDRAW sent')
    expect(html).toContain('inc-vol withdrawn')
    expect(html).toContain('2 phones')
  })

  it('offers no Verify on a verified incident and always says WITHDRAW is code, not an instruction', () => {
    const detail = fixture('normal')
    detail.incident.status = 'verified'
    const html = view({ detail })
    expect(html).not.toContain('Verify incident')
    expect(html).toContain('WITHDRAW is not an instruction here. Code sends it the moment smoke or wind turns dangerous')
  })

  it('has an empty state for an incident with no volunteers and no tasks', () => {
    const detail: IncidentDetail = { ...fixture('normal'), observations: [], tasks: [] }
    const html = view({ detail })
    expect(html).toContain('No volunteers on this incident yet.')
    expect(html).toContain('No proposed tasks yet.')
    expect(html).toContain('No reports yet.')
  })
})

describe('incident detail: language', () => {
  it('shows Bahasa copy for fixed labels and keeps API text as is', () => {
    const html = view({}, 'id')
    expect(html).toContain('Langsung dari lapangan')
    expect(html).toContain('DITAHAN · KONFLIK')
    expect(html).toContain('Linimasa')
    expect(html).toContain('Instruksi untuk semua di lokasi')
    expect(html).toContain('Api kecil')
    expect(html).toContain('2 di lokasi')
    expect(html).toContain('Setujui')
    expect(html).toContain('menunggu persetujuan')
    expect(html).toContain('Laporan berbeda')
    expect(html).not.toContain('>Approve<')
    expect(html).not.toContain('Source:')
    expect(html).toContain('← Insiden')
    expect(html).toContain('Ketapang, Kalimantan Barat · Pak Dedi · #1')
    expect(html).not.toContain('Live from the field')
  })
})

describe('incident detail: loading and errors', () => {
  it('shows the skeleton with the incident name from the queue while it loads', () => {
    const queue = [fixture('normal').incident]
    const html = view({ detail: null, queue })
    expect(html).toContain('role="status"')
    expect(html).toContain('Loading Ketapang, Kalimantan Barat · Pak Dedi · #1…')
    expect(html).toContain('inc-skel')
    expect(html).not.toContain('Approve')
  })

  it('uses the short code while loading an incident the queue does not have', () => {
    expect(view({ detail: null, queue: null, incidentId: '4kQ9xZ7hLm' })).toContain('Loading INC-7HLM…')
  })

  it('explains a missing incident in plain words with a way back, and no status code', () => {
    const html = view({ detail: null, failure: 'not_found' })
    expect(html).toContain('Incident not found')
    expect(html).toContain('href="/console"')
    expect(html).not.toMatch(/404|not_found/)
  })

  it('explains a failed read and offers a retry that is not a status code', () => {
    const onRetry = vi.fn()
    const html = view({ detail: null, failure: 'failed', onRetry })
    expect(html).toContain('Could not load this incident')
    expect(html).toContain('Try again')
    expect(html).not.toMatch(/500|exception|stack/i)
  })
})

describe('incident detail: connection lost', () => {
  it('keeps the last known incident, shows the reconnect bar and the safety rules', () => {
    const html = view({ link: 'lost' })
    expect(html).toContain('Reconnecting…')
    expect(html).toContain(`last update ${formatTime(NOW - 2 * 60000)} (2 min ago)`)
    expect(html).toContain('Retrying every 5 s.')
    expect(html).toContain('Retry now')
    expect(html).toContain('WHAT STILL WORKS WITHOUT YOUR CONSOLE')
    expect(html).toContain('WITHDRAW still reaches every phone')
    expect(html).toContain('sending is blocked until you are back')
    expect(html).toContain('LAST KNOWN')
    expect(html).toContain('<h1 class="inc-title">Ketapang, Kalimantan Barat · Pak Dedi · #1</h1>')
    expect(html).toContain('aria-label="Dedi"')
  })

  it('blocks every write: Verify, Approve, Edit and Reject are disabled', () => {
    const html = view({ link: 'lost' })
    for (const label of ['Offline · can’t send', 'Approve', 'Edit', 'Reject']) {
      expect(html).toContain(`>${label}<`)
      expect(html).not.toMatch(new RegExp(`<button\\b(?![^>]*disabled)[^>]*>${label}<`))
    }
  })

  it('keeps writes enabled while online', () => {
    const html = view({ link: 'online' })
    expect(html).not.toContain('Reconnecting…')
    expect(html).not.toContain('Offline · can’t send')
    expect(html).toMatch(/<button\b(?![^>]*disabled)[^>]*>Verify incident</)
    expect(html).toMatch(/<button\b(?![^>]*disabled)[^>]*>Reject</)
  })

  it('says nothing has loaded yet when the first read already failed', () => {
    const html = view({ detail: null, failure: 'network', link: 'lost', lastOkAt: null })
    expect(html).toContain('Reconnecting…')
    expect(html).toContain('Nothing has been loaded yet.')
    expect(html).toContain('Retry now')
    expect(html).not.toContain('Live from the field')
  })

  it('shows the back-online bar for a moment after reconnecting', () => {
    const html = view({ link: 'restored' })
    expect(html).toContain('Back online. Everything is refreshed.')
    expect(html).not.toContain('Reconnecting…')
  })

  it('speaks Bahasa while offline', () => {
    const html = view({ link: 'lost' }, 'id')
    expect(html).toContain('Menyambung kembali…')
    expect(html).toContain('pembaruan terakhir')
    expect(html).toContain('Offline · tidak bisa kirim')
    expect(html).toContain('TERAKHIR DIKETAHUI')
  })
})

describe('incident dialog shell', () => {
  it('is a labelled modal dialog and draws its content', () => {
    const html = renderToStaticMarkup(
      <Modal title="Send WITHDRAW at Bengkalis, Riau · Sari · #3" onClose={() => undefined}>
        <p>content</p>
      </Modal>,
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    const labelledBy = html.match(/aria-labelledby="([^"]+)"/)?.[1]
    expect(labelledBy).toBeTruthy()
    expect(html).toContain(`id="${labelledBy}">Send WITHDRAW at Bengkalis, Riau · Sari · #3</h2>`)
    expect(html).toContain('<p>content</p>')
  })
})

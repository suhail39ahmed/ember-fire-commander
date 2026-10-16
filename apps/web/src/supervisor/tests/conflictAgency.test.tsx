import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { ConflictContext, IncidentDetail, Observation, TimelineEntry } from '../contracts'
import { AgencyInCharge } from '../detail/AgencyInCharge'
import { IncidentDetailView, type IncidentDetailViewProps } from '../detail/IncidentDetailView'
import { fixture } from '../fixtures'
import type { IncidentActions } from '../IncidentView'

const NOW = Date.parse('2026-10-17T03:10:00Z')

function actions(): IncidentActions {
  return { busyId: null, outcomes: {}, onApprove: () => undefined, onReject: () => undefined, saveEdit: async () => ({ task: fixture('normal').tasks[0], auditId: 'aud_1' } as never), onVerify: () => undefined }
}

function view(detail: IncidentDetail, lang: 'id' | 'en' = 'en', yourAgency?: string | null) {
  const props: IncidentDetailViewProps = {
    lang,
    incidentId: detail.incident.id,
    detail,
    queue: [detail.incident],
    failure: null,
    link: 'online',
    lastOkAt: NOW,
    now: NOW,
    actions: actions(),
    onRetry: () => undefined,
    onSelect: () => undefined,
    actorName: 'Bu Maya',
    serverNow: () => NOW,
    sendWithdraw: async () => ({ incident: detail.incident, auditId: 'aud_1' }),
    lowerSeverity: async () => ({ incident: detail.incident, auditId: 'aud_1' }),
    extinguish: async () => ({ incident: detail.incident, auditId: 'aud_1' }),
    sendInstruction: async () => ({ task: fixture('normal').tasks[0], auditId: 'aud_i' }),
    photoUrl: async () => ({ url: 'https://photo.example/x.jpg', expiresAt: '2026-10-17T03:15:00Z' }),
    markSafe: async () => ({ incident: detail.incident, auditId: 'aud_1' }),
    resendTask: async () => ({ auditId: 'aud_3' }),
    yourAgency,
  }
  return renderToStaticMarkup(
    <StaticRouter location="/console/incidents/inc_demo_01">
      <IncidentDetailView {...props} />
    </StaticRouter>,
  )
}

const ayu: Observation = {
  id: 'obs_demo_03',
  volunteerId: 'uid_ayu',
  volunteerName: 'Ayu',
  capturedAt: '2026-10-17T03:06:00Z',
  receivedAt: '2026-10-17T03:06:02Z',
  source: 'text',
  lat: -1.8495,
  lng: 110.0514,
  accuracyM: 30,
  chip: null,
  text: 'Asap tebal dekat kanal',
  severity: 'unknown',
  photoPath: null,
  immutable: true,
}

const decision = (over: Partial<TimelineEntry>): TimelineEntry => ({
  kind: 'audit', id: 'aud_1', at: '2026-10-17T03:07:00Z', action: 'task.approve', actorId: 'uid_maya', actorName: 'Bu Maya',
  volunteerId: 'uid_dedi', taskId: 'task_demo_verify_dedi', severity: null, source: null, chip: null, text: null, ...over,
})

function conflictWith(context: ConflictContext | null | undefined, over: Partial<IncidentDetail> = {}): IncidentDetail {
  const detail = fixture('conflict')
  // The real system never creates an investigate task, so the real read has only the two verify proposals.
  detail.tasks = detail.tasks.filter((t) => t.type !== 'investigate')
  if (context !== undefined) detail.conflictContext = context
  return { ...detail, ...over }
}

describe('reports disagree: reports on neither side', () => {
  it('lists every other report from the stored records, beside the two sides', () => {
    const html = view(conflictWith({ otherObservations: [ayu], audit: [] }))
    expect(html).toContain('Other reports at this incident')
    expect(html).toContain('1 · on neither side of the disagreement')
    expect(html).toContain('>Ayu</h3>')
    expect(html).toContain('±30 m')
    expect(html).toContain('“Asap tebal dekat kanal” · text')
    expect(html.match(/class="rep"/g)).toHaveLength(3)
  })

  it('draws nothing for them when there are none, or when the API sent no context', () => {
    for (const context of [{ otherObservations: [], audit: [] }, null, undefined]) {
      const html = view(conflictWith(context))
      expect(html).not.toContain('Other reports at this incident')
      expect(html.match(/class="rep"/g)).toHaveLength(2)
    }
  })

  it('speaks Bahasa', () => {
    const html = view(conflictWith({ otherObservations: [ayu], audit: [] }), 'id')
    expect(html).toContain('Laporan lain di insiden ini')
    expect(html).toContain('tidak di pihak mana pun dalam perbedaan')
  })
})

describe('reports disagree: decisions recorded about it', () => {
  it('lists the stored audit rows with who, when and what, oldest first', () => {
    const html = view(conflictWith({
      otherObservations: [],
      audit: [
        decision({ id: 'aud_1' }),
        decision({ id: 'aud_2', at: '2026-10-17T03:09:00Z', action: 'incident.verify', volunteerId: null, taskId: null }),
      ],
    }))
    expect(html).toContain('Decisions on this disagreement')
    expect(html).toContain('Bu Maya · approved an instruction · Dedi')
    expect(html).toContain('Bu Maya · verified the incident')
    expect(html.indexOf('approved an instruction')).toBeLessThan(html.indexOf('verified the incident'))
  })

  it('says plainly when nothing is recorded, and that no record shows when the disagreement opened', () => {
    const html = view(conflictWith({ otherObservations: [], audit: [] }))
    expect(html).toContain('No decision has been recorded yet.')
    expect(html).toContain('No record shows when the disagreement opened.')
  })

  it('shows nothing for an older API with no context, and nothing without a conflict', () => {
    expect(view(conflictWith(undefined))).not.toContain('Decisions on this disagreement')
    expect(view(fixture('normal'))).not.toContain('Decisions on this disagreement')
  })

  it('speaks Bahasa', () => {
    const html = view(conflictWith({ otherObservations: [], audit: [] }), 'id')
    expect(html).toContain('Keputusan atas perbedaan ini')
    expect(html).toContain('Belum ada keputusan yang tercatat.')
  })
})

describe('reports disagree: dispatch proposals', () => {
  it('says no dispatch proposal is recorded when the conflict has none, and still lists the verify proposals', () => {
    const html = view(conflictWith({ otherObservations: [], audit: [] }))
    expect(html).toContain('The agents have not recorded a dispatch (investigate) proposal for this incident.')
    expect(html.match(/<li class="prop /g)).toHaveLength(2)
  })

  it('does not say it when a dispatch proposal exists, or when there is no conflict', () => {
    expect(view(fixture('conflict'))).not.toContain('have not recorded a dispatch')
    expect(view(fixture('normal'))).not.toContain('have not recorded a dispatch')
  })
})

describe('agency in charge', () => {
  it('shows the agency stored on the incident', () => {
    const html = view(conflictWith(null, { agencyInCharge: 'BPBD Kepulauan Meranti' }))
    expect(html).toContain('Agency in charge')
    expect(html).toContain('<p class="agency-name">BPBD Kepulauan Meranti</p>')
    expect(html).not.toContain('Not recorded')
  })

  it('shows the marked empty state when none is stored: null, blank or absent', () => {
    for (const agencyInCharge of [null, '   ', undefined]) {
      const html = view(conflictWith(null, { agencyInCharge }))
      expect(html).toContain('Agency in charge')
      expect(html).toContain('agency-name agency-empty">Not recorded')
      expect(html).toContain('No agency has been recorded as in charge of this incident.')
    }
  })

  it('shows the supervisor’s own agency apart, labelled as theirs, and never as the one in charge', () => {
    const html = view(conflictWith(null, { agencyInCharge: null }), 'en', 'BPBD Kepulauan Meranti')
    expect(html).toContain('Your agency (from your profile): BPBD Kepulauan Meranti')
    expect(html).toContain('Not recorded')
    expect(html).not.toContain('<p class="agency-name">BPBD')
  })

  it('leaves out the own-agency line when the profile has none', () => {
    expect(view(fixture('normal'), 'en', null)).not.toContain('Your agency')
    expect(view(fixture('normal'), 'en', '  ')).not.toContain('Your agency')
  })

  it('is on every incident, with or without a conflict, and speaks Bahasa', () => {
    const html = view(fixture('normal'), 'id', 'BPBD Meranti')
    expect(html).toContain('Instansi penanggung jawab')
    expect(html).toContain('Belum tercatat')
    expect(html).toContain('Belum ada instansi yang tercatat sebagai penanggung jawab insiden ini.')
    expect(html).toContain('Instansi Anda (dari profil)')
  })

  it('has no hand-off control: nothing here sends an incident to an agency', () => {
    const html = view(conflictWith(null, { agencyInCharge: 'BPBD Kepulauan Meranti' }), 'en', 'BPBD Kepulauan Meranti')
    expect(html).not.toMatch(/hand ?off|hand over|serahkan|packet/i)
    const card = renderToStaticMarkup(<AgencyInCharge lang="en" agency={null} yours={null} />)
    expect(card).not.toContain('<button')
  })
})

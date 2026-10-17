import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { ConflictContext, IncidentDetail, Observation, TimelineEntry } from '../contracts'
import { IncidentDetailView, type IncidentDetailViewProps } from '../detail/IncidentDetailView'
import { fixture } from '../fixtures'
import type { IncidentActions } from '../IncidentView'

const NOW = Date.parse('2026-10-17T03:10:00Z')

function actions(): IncidentActions {
  return { busyId: null, outcomes: {}, onApprove: () => undefined, onReject: () => undefined, saveEdit: async () => ({ task: fixture('normal').tasks[0], auditId: 'aud_1' } as never), onVerify: () => undefined }
}

function view(detail: IncidentDetail, lang: 'id' | 'en' = 'en') {
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

describe('incident detail has no agency card', () => {
  it('leaves out "Agency in charge" in both languages, with or without a stored agency', () => {
    for (const lang of ['en', 'id'] as const) {
      for (const detail of [fixture('normal'), conflictWith(null, { agencyInCharge: 'BPBD Kepulauan Meranti' })]) {
        const html = view(detail, lang)
        expect(html).not.toContain('Agency in charge')
        expect(html).not.toContain('Instansi penanggung jawab')
        expect(html).not.toContain('No agency has been recorded')
        expect(html).not.toContain('class="agency-name')
      }
    }
  })
})

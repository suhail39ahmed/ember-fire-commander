import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiError } from '../../pwa/api/types'
import { createHttpSupervisorApi } from '../api/client'
import { createMockSupervisorApi } from '../api/mock'
import type { IncidentDetail, Observation } from '../contracts'
import { IncidentDetailView, type IncidentDetailViewProps } from '../detail/IncidentDetailView'
import { distanceM, nameOf, volunteersOf } from '../detail/model'
import { outcomeText, reasonOf } from '../detail/outcomeCopy'
import { ReportCard } from '../detail/ReportCard'
import { fixture } from '../fixtures'
import type { IncidentActions, Outcome } from '../IncidentView'

const NOW = Date.parse('2026-10-17T03:10:00Z')

function actions(over: Partial<IncidentActions> = {}): IncidentActions {
  return { busyId: null, outcomes: {}, onApprove: () => undefined, onReject: () => undefined, saveEdit: async () => ({ task: fixture('normal').tasks[0], auditId: 'aud_1' } as never), onVerify: () => undefined, ...over }
}

function view(over: Partial<IncidentDetailViewProps> = {}, lang: 'id' | 'en' = 'en') {
  const detail = fixture('conflict')
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
    ...over,
  }
  return renderToStaticMarkup(
    <StaticRouter location="/console/incidents/inc_demo_01">
      <IncidentDetailView {...props} />
    </StaticRouter>,
  )
}

const dedi = fixture('conflict').observations[0]
const sari = fixture('conflict').observations[1]

describe('reports disagree: the two reports', () => {
  it('shows both reports side by side, unchanged, with reporter, time, accuracy, chip, severity, text and mode', () => {
    const html = view()
    expect(html.match(/class="rep"/g)).toHaveLength(2)
    expect(html).toContain('>Dedi</h3>')
    expect(html).toContain('>Sari</h3>')
    expect(html).toContain('±15 m')
    expect(html).toContain('±22 m')
    expect(html).toContain('<strong>Fire</strong><small>api</small>')
    expect(html).toContain('<strong>Smoke</strong><small>asap</small>')
    expect(html).toContain('Small flame')
    expect(html).toContain('“Api kecil di parit belakang kebun” · quick chip')
    expect(html).toContain('“Saya lihat asap saja, tidak ada api.” · quick chip')
    expect(html.match(/ORIGINAL REPORT · UNCHANGED/g)).toHaveLength(2)
  })

  it('never merges or averages: the cards are the two stored observations in the order the conflict lists them', () => {
    const html = view()
    expect(html.indexOf('Dedi</h3>')).toBeLessThan(html.indexOf('Sari</h3>'))
    expect(html.match(/class="rep"/g)).toHaveLength(2)
    expect(html).not.toContain('class="rep rep-merged')
  })

  it('speaks Bahasa', () => {
    const html = view({}, 'id')
    expect(html).toContain('LAPORAN ASLI · TIDAK DIUBAH')
    expect(html).toContain('Laporan berbeda — dispatch ditahan')
    expect(html).toContain('<strong>api</strong>')
  })

  it('uses the stored name, and a short code for a reporter with none; it never makes a name from the id', () => {
    const noName: Observation = { ...dedi, volunteerName: undefined, volunteerId: 'x8KdPq2LmZ7hLm' }
    const html = renderToStaticMarkup(<ReportCard lang="en" obs={noName} />)
    expect(html).toContain('>Volunteer 7HLM</h3>')
    expect(nameOf({ observations: [dedi, sari] }, 'uid_sari', 'en')).toBe('Sari')
    expect(nameOf({ observations: [dedi] }, 'uid_sari', 'en')).toBe('Volunteer SARI')
    expect(volunteersOf(fixture('conflict')).find((r) => r.id === 'uid_dedi')?.name).toBe('Dedi')
  })

  it('measures the gap between the two positions for the sentence, and says so only when both have one', () => {
    const gap = distanceM(dedi, sari)
    expect(gap).toBeGreaterThan(30)
    expect(gap).toBeLessThan(80)
    expect(distanceM(dedi, { lat: Number.NaN, lng: 1 })).toBeNull()
    expect(view()).toContain(`${gap} m apart`)
  })
})

describe('reports disagree: the banner', () => {
  it('says dispatch is on hold and that code kept the higher severity and made a verify task for each', () => {
    const html = view()
    expect(html).toContain('Reports disagree — dispatch on hold')
    expect(html).toContain('Dedi says small flame, Sari says smoke')
    expect(html).toContain('Code kept the higher severity and created a verify task for each.')
    expect(html).toMatch(/dis-banner" role="alert"/)
    expect(html).toContain('HELD · CONFLICT')
  })

  it('is quiet when the conflict is resolved', () => {
    const detail = fixture('conflict')
    detail.conflict!.status = 'resolved'
    const html = view({ detail })
    expect(html).toContain('Conflict resolved')
    expect(html).not.toContain('dispatch on hold')
    expect(html).not.toContain('role="alert" class="dis-banner')
  })

  it('has no banner and no report pair when there is no conflict', () => {
    const html = view({ detail: fixture('normal') })
    expect(html).not.toContain('dis-banner')
    expect(html).not.toContain('class="rep"')
  })
})

describe('reports disagree: the proposals', () => {
  it('lists the proposed verify and dispatch tasks with Edit, Reject and Approve on each', () => {
    const html = view()
    expect(html).toContain('>Proposals</h2>')
    expect(html.match(/<li class="prop /g)).toHaveLength(3)
    expect(html).toContain('VERIFY · PROPOSED · DEDI')
    expect(html).toContain('VERIFY · PROPOSED · SARI')
    expect(html).toContain('DISPATCH · PROPOSED · DEDI')
    expect(html.match(/>Edit<\/button>/g)).toHaveLength(3)
    expect(html.match(/>Reject<\/button>/g)).toHaveLength(3)
    expect(html.match(/>Approve<\/button>/g)).toHaveLength(3)
  })

  it('keeps Approve on the verify proposals and turns it off on the dispatch while the conflict is open', () => {
    const html = view()
    const rows = html.split('<li class="prop ').slice(1)
    const dispatch = rows.find((r) => r.startsWith('investigate'))!
    const verify = rows.filter((r) => r.startsWith('verify'))
    expect(dispatch).toMatch(/<button[^>]*disabled=""[^>]*>Approve</)
    for (const row of verify) expect(row).not.toMatch(/<button[^>]*disabled=""[^>]*>Approve</)
  })

  it('shows the 409 inline on the blocked dispatch only, as the frame prints it', () => {
    const html = view()
    const rows = html.split('<li class="prop ').slice(1)
    expect(rows.filter((r) => r.includes('409 · Can’t approve dispatch while reports disagree'))).toHaveLength(1)
    expect(rows.find((r) => r.startsWith('investigate'))).toContain('409 · Can’t approve dispatch')
  })

  it('offers Approve on the dispatch once the conflict is resolved', () => {
    const detail = fixture('conflict')
    detail.conflict!.status = 'resolved'
    const html = view({ detail })
    expect(html).not.toContain('409 ·')
    const dispatch = html.split('<li class="prop ').slice(1).find((r) => r.startsWith('investigate'))!
    expect(dispatch).not.toMatch(/<button[^>]*disabled=""[^>]*>Approve</)
  })

  it('does not offer decisions on a withdraw task, and keeps it in the instructions list', () => {
    const html = view({ detail: fixture('withdraw') })
    expect(html.match(/<li class="prop /g)).toHaveLength(3)
    expect(html).toContain('sup-task type-withdraw')
  })

  it('blocks every proposal button while offline', () => {
    const html = view({ link: 'lost' })
    const rows = html.split('<li class="prop ').slice(1)
    for (const row of rows) {
      expect(row).toMatch(/<button[^>]*disabled=""[^>]*>Edit</)
      expect(row).toMatch(/<button[^>]*disabled=""[^>]*>Reject</)
      expect(row).toMatch(/<button[^>]*disabled=""[^>]*>Approve</)
    }
  })

  it('shows the confirmed result of an approve in the supervisor’s language, with the audit id', () => {
    const outcome: Outcome = { kind: 'ok', text: 'Confirmed by ember-api: approved · audit aud_9', action: 'approve', auditId: 'aud_9' }
    const en = view({ actions: actions({ outcomes: { task_demo_verify_sari: outcome } }) })
    expect(en).toContain('Approved · audit aud_9')
    const id = view({ actions: actions({ outcomes: { task_demo_verify_sari: outcome } }) }, 'id')
    expect(id).toContain('Disetujui · audit aud_9')
  })
})

describe('reports disagree: refusals in plain language', () => {
  const held = new ApiError('conflict', 'Dispatch is held while this incident has an open conflict', 409, false)

  it('maps each failure to one reason, from the status and the 409 sentence', () => {
    expect(reasonOf(held)).toBe('held')
    expect(reasonOf(new ApiError('conflict', 'Only a proposed task can be approved', 409, false))).toBe('not_proposed')
    expect(reasonOf(new ApiError('conflict', 'A withdraw task is never proposed and cannot be approved', 409, false))).toBe('withdraw_task')
    expect(reasonOf(new ApiError('network', 'Network error', null, true))).toBe('network')
    expect(reasonOf(new ApiError('forbidden', 'Only a supervisor can do this', 403, false))).toBe('forbidden')
    expect(reasonOf(new ApiError('not_found', 'task is unknown', 404, false))).toBe('not_found')
    expect(reasonOf(new ApiError('validation_error', 'bad', 400, false))).toBe('invalid')
    expect(reasonOf(new ApiError('unavailable', 'HTTP 503', 503, true))).toBe('server')
    expect(reasonOf(new Error('boom'))).toBe('server')
  })

  it('says it in ID and EN with no status code, exception name or server text', () => {
    const reasons = ['network', 'held', 'not_proposed', 'withdraw_task', 'forbidden', 'not_found', 'invalid', 'server'] as const
    for (const reason of reasons) {
      const outcome: Outcome = { kind: 'error', text: 'HTTP 503 raw server text', reason }
      for (const lang of ['en', 'id'] as const) {
        const text = outcomeText(outcome, lang).replace(/500 (characters|karakter)/, '')
        expect(text).not.toMatch(/\b(40[0-9]|50[0-9])\b|HTTP|raw server|TypeError/)
        expect(text.length).toBeGreaterThan(20)
        expect(outcomeText(outcome, lang)).not.toBe(outcome.text)
      }
      expect(outcomeText(outcome, 'id')).not.toBe(outcomeText(outcome, 'en'))
    }
  })

  it('shows a refused approve under its proposal and leaves the task as it was', () => {
    const outcome: Outcome = { kind: 'error', text: 'x', reason: 'held' }
    const html = view({ actions: actions({ outcomes: { task_demo_investigate: outcome } }) })
    expect(html).toContain('Dispatch can’t be approved while the reports disagree. Nothing was changed.')
    expect(html.match(/<li class="prop /g)).toHaveLength(3)
  })
})

describe('reports disagree: evidence factors', () => {
  it('lists the factors the API sent, with their points', () => {
    const html = view()
    expect(html).toContain('Why evidence is 40')
    expect(html).toContain('+35')
    expect(html).toContain('−20')
    expect(html).toContain('highest reported severity is small_flame')
    expect(html).toContain('reports disagree')
    expect(html).toContain('This score is not a probability.')
  })

  it('does not invent wind or satellite lines', () => {
    const html = view()
    const section = html.slice(html.indexOf('Why evidence is'), html.indexOf('</section>', html.indexOf('Why evidence is')))
    expect(section).not.toMatch(/wind|satellite|angin|satelit/i)
  })

  it('says so when the API sent none', () => {
    const detail: IncidentDetail = { ...fixture('conflict'), evidenceFactors: [] }
    expect(view({ detail })).toContain('ember-api has not sent the evidence factors.')
    const old = fixture('conflict')
    delete old.evidenceFactors
    expect(view({ detail: old })).toContain('ember-api has not sent the evidence factors.')
  })
})

describe('reports disagree: the API', () => {
  it('the mock refuses a dispatch approval while the conflict is open, changes nothing, and still approves a verify task', async () => {
    const api = createMockSupervisorApi('sup_1', 'conflict', 0)
    await expect(api.approveTask('task_demo_investigate')).rejects.toMatchObject({ status: 409 })
    const after = await api.getIncident('inc_demo_01')
    expect(after.tasks.find((t) => t.id === 'task_demo_investigate')?.status).toBe('proposed')
    expect(api.mock.audit).toHaveLength(0)
    const ok = await api.approveTask('task_demo_verify_sari')
    expect(ok.task.status).toBe('approved')
    expect(api.mock.audit.map((a) => a.action)).toEqual(['task.approve'])
  })

  it('reads the names and factors from GET /incidents/{id} as the route sends them', async () => {
    const body = fixture('conflict')
    const fetchImpl = async () => new Response(JSON.stringify(body), { status: 200 })
    const api = createHttpSupervisorApi(async () => ({ Authorization: 'Bearer t', 'X-Firebase-AppCheck': 'a' }), 'https://api.example', fetchImpl as unknown as typeof fetch)
    const detail = await api.getIncident('inc_demo_01')
    expect(detail.observations[0].volunteerName).toBe('Dedi')
    expect(detail.evidenceFactors?.map((f) => f.factor)).toEqual(['severity', 'corroboration', 'gps', 'conflict'])
  })
})

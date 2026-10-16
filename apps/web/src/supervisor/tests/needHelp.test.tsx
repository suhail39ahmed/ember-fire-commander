import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { formatTimeZone } from '../../pwa/formatTime'
import type { IncidentDetail } from '../contracts'
import { helpRequests } from '../detail/helpModel'
import { IncidentDetailView, type IncidentDetailViewProps } from '../detail/IncidentDetailView'
import { NeedHelpBanner } from '../detail/NeedHelpBanner'
import { ReportCard } from '../detail/ReportCard'
import { fixture } from '../fixtures'
import { IncidentView, type IncidentActions } from '../IncidentView'

const NOW = Date.parse('2026-10-17T03:10:00Z')
const noop: IncidentActions = {
  busyId: null,
  outcomes: {},
  onApprove: () => undefined,
  onReject: () => undefined,
  saveEdit: async () => { throw new Error('not used') },
  onVerify: () => undefined,
}

/** The normal fixture, with the first report turned into a "Need help" report from a named volunteer. */
function withHelp(): IncidentDetail {
  const detail = fixture('normal')
  detail.observations = detail.observations.map((o, i) => (i === 0 ? { ...o, chip: 'butuh_bantuan', text: 'Api dekat rumah', volunteerName: 'Pak Dedi' } : o))
  return detail
}

function page(detail: IncidentDetail, over: Partial<IncidentDetailViewProps> = {}, lang: 'id' | 'en' = 'en') {
  const props: IncidentDetailViewProps = {
    lang,
    incidentId: detail.incident.id,
    detail,
    queue: [detail.incident],
    failure: null,
    link: 'online',
    lastOkAt: NOW,
    now: NOW,
    actions: noop,
    onRetry: () => undefined,
    onSelect: () => undefined,
    markSafe: async () => ({ incident: detail.incident, auditId: 'a' }),
    resendTask: async () => ({ auditId: 'a' }),
    sendWithdraw: async () => ({ incident: detail.incident, auditId: 'a' }),
    actorName: 'Bu Maya',
    lowerSeverity: async () => ({ incident: detail.incident, auditId: 'a' }),
    serverNow: () => NOW,
    extinguish: async () => ({ incident: detail.incident, auditId: 'a' }),
    sendInstruction: async () => ({ task: detail.tasks[0], auditId: 'a' }),
    photoUrl: async () => ({ url: 'https://photo.example/x.jpg', expiresAt: '2026-10-17T03:15:00Z' }),
    ...over,
  }
  return renderToStaticMarkup(
    <StaticRouter location={`/console/incidents/${detail.incident.id}`}>
      <IncidentDetailView {...props} />
    </StaticRouter>,
  )
}

describe('need help: the model', () => {
  it('lists only the help reports, newest first, with the volunteer and the report text', () => {
    const detail = withHelp()
    const [first] = detail.observations
    const list = helpRequests(detail, 'en')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: first.id, volunteerId: first.volunteerId, name: 'Pak Dedi', text: 'Api dekat rumah' })
  })

  it('finds nothing when nobody asked for help', () => {
    expect(helpRequests(fixture('normal'), 'en')).toEqual([])
  })

  it('also reads help reports a conflict leaves out of the observations, from the timeline, once each', () => {
    const detail = withHelp()
    const gone = detail.observations[0]
    detail.timeline = [
      { kind: 'report', id: gone.id, at: gone.capturedAt, action: null, actorId: null, actorName: null, volunteerId: gone.volunteerId, taskId: null, severity: 'smoke', source: 'text', chip: 'butuh_bantuan', text: null },
      { kind: 'report', id: 'obs_extra', at: '2026-10-17T03:09:00Z', action: null, actorId: null, actorName: null, volunteerId: 'uid_sari', taskId: null, severity: 'smoke', source: 'text', chip: 'butuh_bantuan', text: 'Tolong' },
    ]
    detail.observations = []
    const list = helpRequests(detail, 'en')
    expect(list).toHaveLength(2)
    expect(list.map((r) => r.id).sort()).toEqual([gone.id, 'obs_extra'].sort())
    expect(Date.parse(list[0].at)).toBeGreaterThanOrEqual(Date.parse(list[1].at))
  })
})

describe('need help: the incident detail', () => {
  it('shows a red alert naming the volunteer, the time and the text, with a Reply action', () => {
    const detail = withHelp()
    const html = page(detail)
    expect(html).toContain('class="inc-help"')
    expect(html).toContain('role="alert"')
    expect(html).toContain('NEED HELP')
    expect(html).toContain('<strong>Pak Dedi</strong> sent “Need help”')
    expect(html).toContain(formatTimeZone(detail.observations[0].capturedAt))
    expect(html).toContain('“Api dekat rumah”')
    expect(html).toContain('aria-label="Reply Pak Dedi"')
  })

  it('highlights that volunteer’s card and badges it', () => {
    const html = page(withHelp())
    expect(html).toMatch(/class="inc-vol help"/)
    expect(html).toContain('<span class="inc-pill inc-pill-red">Need help</span>')
  })

  it('shows nothing extra when nobody asked for help', () => {
    const html = page(fixture('normal'))
    expect(html).not.toContain('inc-help')
    expect(html).not.toContain('inc-vol help')
  })

  it('speaks Bahasa', () => {
    const html = page(withHelp(), {}, 'id')
    expect(html).toContain('BUTUH BANTUAN')
    expect(html).toContain('mengirim “Butuh bantuan”')
    expect(html).toContain('aria-label="Balas Pak Dedi"')
  })

  it('turns Reply off while ember-api cannot be reached', () => {
    const html = page(withHelp(), { link: 'lost' })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Reply Pak Dedi"|<button[^>]*aria-label="Reply Pak Dedi"[^>]*disabled=""/)
  })
})

describe('need help: the report card', () => {
  it('highlights a help report and leaves the others alone', () => {
    const detail = withHelp()
    expect(renderToStaticMarkup(<ReportCard lang="en" obs={detail.observations[0]} />)).toContain('class="rep help"')
    expect(renderToStaticMarkup(<ReportCard lang="en" obs={detail.observations[1] ?? { ...detail.observations[0], chip: null }} />)).toContain('class="rep"')
  })
})

describe('need help: the banner alone', () => {
  it('renders nothing without a request, and no Reply button without a handler', () => {
    expect(renderToStaticMarkup(<NeedHelpBanner lang="en" requests={[]} />)).toBe('')
    const html = renderToStaticMarkup(<NeedHelpBanner lang="en" requests={helpRequests(withHelp(), 'en')} />)
    expect(html).toContain('NEED HELP')
    expect(html).not.toContain('<button')
  })
})

describe('reports panel on the dashboard', () => {
  it('names the reporter from the stored name, and says Volunteer when there is none, never an id', () => {
    const detail = fixture('normal')
    detail.observations = [
      { ...detail.observations[0], volunteerId: 'uid_t4l7xk9', volunteerName: undefined },
      { ...detail.observations[0], id: 'obs_2', volunteerId: 'uid_sari', volunteerName: 'Bu Sari' },
    ]
    const html = renderToStaticMarkup(<IncidentView detail={detail} actions={noop} />)
    expect(html).toContain('Bu Sari · ')
    expect(html).toContain('Report from Volunteer')
    expect(html).not.toMatch(/t4l7|T4L7|uid_/)
    expect(renderToStaticMarkup(<IncidentView detail={detail} actions={noop} lang="id" />)).toContain('Relawan · ')
  })

  it('shows report times in the viewer’s time zone, never a fixed UTC', () => {
    const detail = fixture('normal')
    const html = renderToStaticMarkup(<IncidentView detail={detail} actions={noop} />)
    expect(html).toContain(formatTimeZone(detail.observations[0].capturedAt))
  })

  it('highlights a help report and shows the alert', () => {
    const html = renderToStaticMarkup(<IncidentView detail={withHelp()} actions={noop} />)
    expect(html).toContain('class="sup-obs help"')
    expect(html).toContain('class="inc-help"')
    expect(html).toContain('NEED HELP')
  })

  it('wraps long report text instead of overflowing', () => {
    const css = readFileSync(new URL('../supervisor.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.sup-obs-text \{[^}]*overflow-wrap: anywhere/)
  })
})

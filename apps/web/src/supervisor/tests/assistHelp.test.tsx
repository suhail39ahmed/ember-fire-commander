import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiError } from '../../pwa/api/types'
import { createHttpSupervisorApi, SUPERVISOR_ENDPOINTS } from '../api/client'
import { createMockSupervisorApi } from '../api/mock'
import type { SupervisorApi } from '../api/types'
import type { IncidentDetail } from '../contracts'
import { fixture } from '../fixtures'
import type { IncidentActions } from '../IncidentView'
import { AskBox, IncidentSuggestions, TranslationLine } from '../detail/AssistBlocks'
import { assistCopy } from '../detail/assistCopy'
import { assistProblem, languageName, worthShowing, type AssistActions } from '../detail/assistModel'
import { IncidentDetailView } from '../detail/IncidentDetailView'
import { popupCopy } from '../detail/popupCopy'
import { popupFor } from '../detail/popupModel'
import { VolunteerPopup } from '../detail/VolunteerPopup'

const NOW = Date.parse('2026-10-17T03:10:00Z')
const headers = async () => ({ Authorization: 'Bearer t' })
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })

const assist: AssistActions = {
  suggest: async () => ({ items: [], source: null, generatedAt: null }),
  ask: async () => ({ answer: 'x', enoughData: true, at: '2026-10-17T03:10:00Z' }),
  translate: async () => ({ english: 'x', sourceLanguage: 'id', at: null }),
}

function withText(detail: IncidentDetail, text: string | null = 'Ada asap tipis dekat kanal'): IncidentDetail {
  const reports = detail.observations.map((o) => (o.volunteerId === 'uid_sari' ? { ...o, text } : o))
  return { ...detail, observations: reports }
}

function popupHtml(detail: IncidentDetail, id: string, withAssist: boolean) {
  return renderToStaticMarkup(
    <VolunteerPopup
      lang="en" detail={detail} volunteerId={id} onClose={() => undefined} offline={false} now={NOW}
      sendInstruction={async () => { throw new Error('unused') }} photoUrl={async () => { throw new Error('unused') }}
      assist={withAssist ? assist : undefined}
    />,
  )
}

function detailHtml(d: IncidentDetail, withAssist: boolean) {
  const noop = { busyId: null, outcomes: {}, onApprove: () => undefined, onReject: () => undefined, onVerify: () => undefined } as unknown as IncidentActions
  return renderToStaticMarkup(
    <StaticRouter location="/console/incidents/inc_demo_01">
      <IncidentDetailView
        lang="en" incidentId="inc_demo_01" detail={d} queue={[d.incident]} failure={null} link="online" lastOkAt={NOW} now={NOW} actions={noop}
        onRetry={() => undefined} onSelect={() => undefined} sendWithdraw={async () => ({ incident: d.incident, auditId: 'a' })} actorName="Bu Maya"
        serverNow={() => NOW} lowerSeverity={async () => ({ incident: d.incident, auditId: 'a' })} extinguish={async () => ({ incident: d.incident, auditId: 'a' })}
        markSafe={async () => ({ incident: d.incident, auditId: 'a' })} resendTask={async () => ({ auditId: 'a' })}
        sendInstruction={async () => ({ task: d.tasks[0], auditId: 'a' })} photoUrl={async () => ({ url: 'https://photo.example/x.jpg', expiresAt: '2026-10-17T03:15:00Z' })}
        assist={withAssist ? assist : undefined}
      />
    </StaticRouter>,
  )
}

describe('the ember-api calls', () => {
  it('posts to the three assist routes', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined })
      return json({ ok: true })
    }) as unknown as typeof fetch
    const api = createHttpSupervisorApi(headers, 'https://api.example', fetchImpl)
    await api.suggestIncident('inc_1')
    await api.askIncident('inc_1', 'How many?', 'uid_sari')
    await api.askIncident('inc_1', 'And the wind?')
    await api.translateObservation('inc_1', 'obs 2')
    expect(calls).toEqual([
      { url: 'https://api.example/incidents/inc_1/suggestions', method: 'POST', body: undefined },
      { url: 'https://api.example/incidents/inc_1/ask', method: 'POST', body: { question: 'How many?', volunteerId: 'uid_sari' } },
      { url: 'https://api.example/incidents/inc_1/ask', method: 'POST', body: { question: 'And the wind?' } },
      { url: 'https://api.example/incidents/inc_1/observations/obs%202/translate', method: 'POST', body: undefined },
    ])
    expect(SUPERVISOR_ENDPOINTS.suggestions('a b')).toBe('/incidents/a%20b/suggestions')
  })

  it('keeps the route error code and status', async () => {
    const api = createHttpSupervisorApi(headers, 'https://api.example', (async () => json({ error: { code: 'agents_unavailable', message: 'down' } }, 502)) as unknown as typeof fetch)
    await expect(api.suggestIncident('inc_1')).rejects.toMatchObject({ code: 'agents_unavailable', status: 502 })
  })

  it('has no model in the mock, so it answers as ember-api does with no agents', async () => {
    const api: SupervisorApi = createMockSupervisorApi('uid_maya', 'conflict', 0)
    await expect(api.suggestIncident('x')).rejects.toMatchObject({ status: 503 })
    await expect(api.askIncident('x', 'q')).rejects.toMatchObject({ status: 503 })
    await expect(api.translateObservation('x', 'o')).rejects.toMatchObject({ status: 503 })
  })
})

describe('what a failed call says', () => {
  it('names the cause in plain words and says nothing was stored', () => {
    expect(assistProblem('en', new ApiError('agents_unavailable', 'x', 502, true))).toBe(assistCopy.errUnavailable.en)
    expect(assistProblem('en', new ApiError('agents_unavailable', 'x', 503, true))).toBe(assistCopy.errUnavailable.en)
    expect(assistProblem('en', new ApiError('forbidden', 'x', 403, false))).toBe(assistCopy.errSession.en)
    expect(assistProblem('en', new ApiError('not_found', 'x', 404, false))).toBe(assistCopy.errGone.en)
    expect(assistProblem('en', new ApiError('validation_error', 'x', 400, false))).toBe(assistCopy.errInvalid.en)
    expect(assistProblem('en', new ApiError('network', 'x', null, true))).toBe(assistCopy.errNetwork.en)
    expect(assistProblem('id', new Error('boom'))).toBe(assistCopy.errUnavailable.id)
  })

  it('shows a translation only when it adds something', () => {
    expect(worthShowing(undefined)).toBe(false)
    expect(worthShowing({ english: 'Smoke', sourceLanguage: 'en', at: null })).toBe(false)
    expect(worthShowing({ english: 'Smoke', sourceLanguage: 'id', at: null })).toBe(true)
    expect(worthShowing({ english: 'Smoke', sourceLanguage: 'und', at: null })).toBe(true)
  })

  it('names known languages and passes other codes through', () => {
    expect(languageName('en', 'id')).toBe('Indonesian')
    expect(languageName('id', 'id')).toBe('Indonesia')
    expect(languageName('en', 'su')).toBe('su')
    expect(languageName('en', null)).toBeNull()
  })
})

describe('suggestions on the incident detail', () => {
  const stored = { items: [{ text: 'Ask Sari for a photo.', rationale: 'No photo is stored.' }], source: 'model' as const, generatedAt: '2026-10-17T03:05:00Z' }

  it('lists each suggestion with its reason, when it was made and where it came from', () => {
    const html = renderToStaticMarkup(<IncidentSuggestions lang="en" suggestions={stored} assist={assist} offline={false} />)
    expect(html).toContain('Ask Sari for a photo.')
    expect(html).toContain('Why: No photo is stored.')
    expect(html).toContain('from AI')
    expect(html).toContain('Refresh AI suggestions')
    expect(html).toContain('A suggestion sends nothing.')
  })

  it('says when they come from the plain rule list', () => {
    const html = renderToStaticMarkup(<IncidentSuggestions lang="en" suggestions={{ ...stored, source: 'template' }} assist={assist} offline={false} />)
    expect(html).toContain('simple rule list, the model was not available')
  })

  it('offers to make the first ones and says nothing is made yet', () => {
    const html = renderToStaticMarkup(<IncidentSuggestions lang="en" suggestions={null} assist={assist} offline={false} />)
    expect(html).toContain('No suggestions have been made for this incident yet.')
    expect(html).toContain('Make AI suggestions')
  })

  it('says the data does not support one rather than showing an empty list', () => {
    const html = renderToStaticMarkup(<IncidentSuggestions lang="en" suggestions={{ items: [], source: 'template', generatedAt: null }} assist={assist} offline={false} />)
    expect(html).toContain('The stored data does not support a suggestion yet.')
  })

  it('turns the button off while offline', () => {
    expect(renderToStaticMarkup(<IncidentSuggestions lang="en" suggestions={null} assist={assist} offline />)).toMatch(/<button[^>]*disabled=""[^>]*>Make AI suggestions/)
  })

  it('is part of the detail only when ember-api provides the calls', () => {
    const d: IncidentDetail = { ...fixture('conflict'), suggestions: stored }
    expect(detailHtml(d, true)).toContain('Ask Sari for a photo.')
    expect(detailHtml(d, false)).not.toContain('Ask Sari for a photo.')
    expect(detailHtml(d, false)).not.toContain(assistCopy.make.en)
  })
})

describe('Ask EMBER in the volunteer pop-up', () => {
  it('shows a working question box when the calls exist and no longer says the chat is not connected', () => {
    const html = popupHtml(fixture('conflict'), 'uid_sari', true)
    expect(html).toContain(`aria-label="${assistCopy.askLabel.en}"`)
    expect(html).toContain('500 characters left')
    expect(html).toContain(assistCopy.askRule.en)
    expect(html).not.toContain(popupCopy.askGap.en)
    expect(html).toContain('Free suggestions with a reason are on the incident page.')
  })

  it('keeps the old not-connected note when they do not', () => {
    const html = popupHtml(fixture('conflict'), 'uid_sari', false)
    expect(html).toContain(popupCopy.askGap.en)
    expect(html).not.toContain(assistCopy.askLabel.en)
  })

  it('is its own box and turns off offline', () => {
    expect(renderToStaticMarkup(<AskBox lang="en" volunteerId="uid_sari" assist={assist} offline />)).toMatch(/<input[^>]*disabled=""/)
  })
})

describe('English translations in the transcript', () => {
  it('shows the stored English under the original and says which language it was', () => {
    const d = withText(fixture('conflict'))
    const sariReport = d.observations.find((o) => o.volunteerId === 'uid_sari')!
    d.translations = { [sariReport.id]: { english: 'Thin smoke near the canal', sourceLanguage: 'id', at: '2026-10-17T03:09:00Z' } }
    const html = popupHtml(d, 'uid_sari', true)
    expect(html).toContain('“Ada asap tipis dekat kanal”')
    expect(html).toContain('“Thin smoke near the canal”')
    expect(html).toContain('from Indonesian')
    expect(popupFor(d, 'uid_sari', 'en')!.translations[sariReport.id].english).toBe('Thin smoke near the canal')
  })

  it('shows nothing extra for a report that is already English', () => {
    const d = withText(fixture('conflict'))
    const sariReport = d.observations.find((o) => o.volunteerId === 'uid_sari')!
    d.translations = { [sariReport.id]: { english: 'Ada asap tipis dekat kanal', sourceLanguage: 'en', at: null } }
    const html = popupHtml(d, 'uid_sari', true)
    expect(html).not.toContain(assistCopy.translate.en)
    expect(html.match(/Ada asap tipis dekat kanal/g)).toHaveLength(1)
  })

  it('offers to translate a report with text and no stored translation, never one with no text', () => {
    const d = withText(fixture('conflict'))
    expect(popupHtml(d, 'uid_sari', true)).toContain(assistCopy.translate.en)
    expect(popupHtml(withText(fixture('conflict'), null), 'uid_sari', true)).not.toContain(assistCopy.translate.en)
    expect(popupHtml(d, 'uid_sari', false)).not.toContain(assistCopy.translate.en)
    expect(renderToStaticMarkup(<TranslationLine lang="en" translation={undefined} observationId="o" hasText={false} assist={assist} offline={false} />)).toBe('')
  })

  it('keeps the original wording whatever is stored', () => {
    const d = withText(fixture('conflict'))
    const sariReport = d.observations.find((o) => o.volunteerId === 'uid_sari')!
    d.translations = { [sariReport.id]: { english: 'Different words', sourceLanguage: 'id', at: null } }
    expect(sariReport.text).toBe('Ada asap tipis dekat kanal')
    expect(popupHtml(d, 'uid_sari', true)).toContain('“Ada asap tipis dekat kanal”')
  })
})

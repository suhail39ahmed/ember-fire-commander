import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createHttpApi, ENDPOINTS } from '../api/client'
import type { IncidentDetail, Observation } from '../contracts/types'
import { FlagReportView } from '../screens/FlagReportScreen'
import { IncidentDetailView } from '../screens/IncidentDetailScreen'
import { fakeBrowser, incident, renderVolunteer, volunteerValue } from './volunteerKit'

fakeBrowser()

function obs(over: Partial<Observation> = {}): Observation {
  return {
    id: 'o_rizal',
    volunteerId: 'vol_2',
    capturedAt: new Date(2026, 9, 17, 14, 12).toISOString(),
    receivedAt: new Date(2026, 9, 17, 14, 12, 5).toISOString(),
    source: 'chip',
    lat: 1,
    lng: 2,
    accuracyM: 18,
    chip: 'api',
    text: 'Small flame by the canal',
    severity: 'small_flame',
    photoPath: null,
    immutable: true,
    ...over,
  }
}
const inc = { ...incident({ name: 'TOHOR-5 · Canal bend · #5' }), evidenceScore: null, conflictId: null }

const view = (over: Partial<Parameters<typeof FlagReportView>[0]> = {}, lang: 'id' | 'en' = 'en') =>
  renderVolunteer(
    <FlagReportView lang={lang} incident={inc} report={obs()} reason={null} photo={null} send={{ kind: 'idle' }} own={false} onReason={() => undefined} onPickPhoto={() => undefined} onSend={() => undefined} onBack={() => undefined} {...over} />,
    { path: '/pwa', lang, value: volunteerValue() },
  )

describe('flag a wrong report (#141)', () => {
  it('names the incident and the report being flagged', () => {
    const html = view()
    expect(html).toMatch(/data-testid="flag-context">TOHOR-5 · Canal bend · #5 · 14:12 · /)
    expect(html).toContain('What is wrong with this report?')
  })

  it('offers the five reasons from the contract, with labels from the bundle', () => {
    const html = view()
    for (const r of ['no_fire', 'duplicate', 'old_photo', 'wrong_place', 'fake']) expect(html).toContain(`data-testid="flag-reason-${r}"`)
    expect(html).toContain("I&#x27;m here, no fire")
    expect(html).toContain('Looks made up')
    expect(view({}, 'id')).toContain('Tampak dibuat-buat')
  })

  it('keeps Send off until a reason is picked, and marks the reason that is', () => {
    expect(view()).toMatch(/data-testid="flag-send"[^>]*disabled=""|disabled=""[^>]*data-testid="flag-send"/)
    const picked = view({ reason: 'old_photo' })
    expect(picked).not.toMatch(/disabled=""[^>]*data-testid="flag-send"/)
    expect(picked).toMatch(/aria-checked="true"[^>]*data-testid="flag-reason-old_photo"|data-testid="flag-reason-old_photo"[^>]*aria-checked="true"/)
  })

  it('says nothing is deleted and does not name the reporter', () => {
    const html = view()
    expect(html).toContain('Nothing is deleted.')
    expect(html).not.toContain('vol_2')
  })

  it('shows the photo preview when one was taken, and a retake button', () => {
    const html = view({ photo: { blob: new Blob(), contentType: 'image/jpeg', previewUrl: 'blob:x' } })
    expect(html).toContain('data-testid="flag-preview"')
    expect(html).toContain('Retake photo')
  })

  it('shows a failure and the done card', () => {
    expect(view({ send: { kind: 'error', message: 'Not sent.' } })).toContain('data-testid="flag-error"')
    const done = view({ send: { kind: 'done' } })
    expect(done).toContain('data-testid="flag-done"')
    expect(done).not.toContain('data-testid="flag-send"')
  })

  it('refuses to flag the volunteer’s own report', () => {
    const html = view({ own: true })
    expect(html).toContain('data-testid="flag-own"')
    expect(html).not.toContain('data-testid="flag-send"')
  })
})

describe('the flag link on the incident detail', () => {
  const detail: IncidentDetail = { incident: inc, observations: [obs(), obs({ id: 'o_me', volunteerId: 'vol_1' })], conflict: null, tasks: [] }
  const html = renderVolunteer(
    <Routes>
      <Route path="/pwa/*" element={<IncidentDetailView state={{ kind: 'ready', detail }} lang="en" volunteerId="vol_1" incidentId="inc_1" onRetry={() => undefined} onBack={() => undefined} />} />
    </Routes>,
    { path: '/pwa', value: volunteerValue() },
  )

  it('is on other people’s reports and not on the volunteer’s own', () => {
    expect(html).toContain('data-testid="flag-o_rizal"')
    expect(html).toContain('href="/pwa/incidents/inc_1/flag/o_rizal"')
    expect(html).not.toContain('data-testid="flag-o_me"')
  })
})

describe('the flag call', () => {
  it('POSTs the reason and a null photo to the report’s flag route', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const api = createHttpApi(async () => ({ Authorization: 'Bearer t' }), 'https://api.example', fetchImpl as unknown as typeof fetch)
    await api.flagObservation('o 1', { reason: 'fake' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.example${ENDPOINTS.flag('o 1')}`)
    expect(url).toContain('/observations/o%201/flag')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'fake', photoPath: null })
  })

  it('sends the photo path when there is one', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const api = createHttpApi(async () => ({ Authorization: 'Bearer t' }), 'https://api.example', fetchImpl as unknown as typeof fetch)
    await api.flagObservation('o1', { reason: 'no_fire', photoPath: 'photos/u/20261016/a.jpg' })
    expect(JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ reason: 'no_fire', photoPath: 'photos/u/20261016/a.jpg' })
  })
})

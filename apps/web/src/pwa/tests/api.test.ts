import { describe, expect, it, vi } from 'vitest'
import { createHttpApi, ENDPOINTS } from '../api/client'
import { createMockApi } from '../api/mock'
import { ApiError } from '../api/types'
import { buildObservation } from '../report/buildObservation'

const pos = { lat: -1.8492, lng: 110.0508, accuracyM: 15 }
const body = buildObservation({ chip: 'api', text: '', capturedAt: '2026-10-17T03:02:00Z' }, pos)
const headers = async () => ({ Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-check' })
const json = (data: unknown, status: number) => new Response(JSON.stringify(data), { status })

describe('http api client', () => {
  it('sends the optional acceptance response and trimmed note', async () => {
    const fetchImpl = vi.fn(async () => json({}, 200))
    const api = createHttpApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await api.acceptTask('task_1', 'on_my_way', '  Bringing the pump  ')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example/tasks/task_1/accept')
    expect(JSON.parse(init.body as string)).toEqual({ response: 'on_my_way', note: 'Bringing the pump' })
  })
  it('PATCHes profile preferences with identity headers and returns the updated profile', async () => {
    const me = { id: 'one', role: 'volunteer', language: 'jv', shareMyLocationWithCrew: false }
    const fetchImpl = vi.fn(async () => json(me, 200))
    const api = createHttpApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await expect(api.patchMe({ language: 'jv', shareMyLocationWithCrew: false })).resolves.toEqual(me)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example/me')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ language: 'jv', shareMyLocationWithCrew: false })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer id-token')
  })

  it('mock preferences retain earlier changes and support a failed save', async () => {
    const api = createMockApi('one', 0)
    await api.patchMe({ language: 'su' })
    expect(await api.patchMe({ shareMyLocationWithCrew: false })).toMatchObject({ language: 'su', shareMyLocationWithCrew: false })
    api.mock.failNext('network')
    await expect(api.patchMe({ language: 'ms' })).rejects.toMatchObject({ code: 'network' })
    expect(await api.patchMe({ shareMyLocationWithCrew: true })).toMatchObject({ language: 'su' })
  })
  it('POSTs the contract body to ember-api with both identity headers', async () => {
    const fetchImpl = vi.fn(async () => json({ ...body, id: 'obs_01' }, 201))
    const api = createHttpApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await api.createObservation(body)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.example${ENDPOINTS.observations}`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(body)
    const sent = init.headers as Record<string, string>
    expect(sent.Authorization).toBe('Bearer id-token')
    expect(sent['X-Firebase-AppCheck']).toBe('app-check')
  })

  it('reads volunteer state from GET /digest', async () => {
    const digest = { updatedAt: '2026-10-17T03:00:00Z', incidents: [], myTasks: [] }
    const fetchImpl = vi.fn(async () => json(digest, 200))
    const api = createHttpApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await expect(api.getDigest()).resolves.toEqual(digest)
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('https://api.example/digest')
  })

  it('calls training and practice endpoints', async () => {
    const training = { video: { id: 'v', title: { id: 'a', en: 'a' }, durationSec: 1, url: null, progressSec: 0 }, lessons: [], doneCount: 0, lessonCount: 0, askChips: [], safetyLines: [] }
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).endsWith('/training')) return json(training, 200)
      if (String(url).endsWith('/training/progress')) return json({ ok: true }, 200)
      return json({ practice: true, reply: { id: 'r', en: 'r' }, correct: null, check: null, safetyLines: [] }, 200)
    })
    const api = createHttpApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await expect(api.getTraining()).resolves.toEqual(training)
    await api.saveTrainingProgress({ videoProgressSec: 10 })
    await api.askPractice({ message: 'wind', lang: 'en' })
    await api.answerPractice('turn/one', '2')
    expect(fetchImpl.mock.calls.map((c) => String(c[0]))).toEqual([
      'https://api.example/training',
      'https://api.example/training/progress',
      'https://api.example/training/practice',
      'https://api.example/training/practice/turn%2Fone/answer',
    ])
  })

  it('sends the phone position on GET /digest, rounded, and only when there is one', async () => {
    const digest = { updatedAt: '2026-10-17T03:00:00Z', incidents: [], myTasks: [], nearby: [], myJoinRequests: [] }
    const fetchImpl = vi.fn(async () => json(digest, 200))
    const api = createHttpApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await api.getDigest({ lat: -1.849213456, lng: 110.0508 })
    await api.getDigest(null)
    const urls = (fetchImpl.mock.calls as unknown as [string][]).map((c) => c[0])
    expect(urls).toEqual(['https://api.example/digest?lat=-1.84921&lng=110.05080', 'https://api.example/digest'])
  })

  it('POSTs a join request and returns its summary', async () => {
    const stored = { id: 'inc_1__uid', incidentId: 'inc_1', volunteerId: 'uid', status: 'pending', createdAt: '2026-10-17T03:00:00Z' }
    const fetchImpl = vi.fn(async () => json({ joinRequest: stored, auditId: 'aud_1' }, 201))
    const api = createHttpApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await expect(api.requestJoin('inc_1')).resolves.toEqual({ incidentId: 'inc_1', status: 'pending', createdAt: '2026-10-17T03:00:00Z' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example/incidents/inc_1/join-requests')
    expect(init.method).toBe('POST')
  })

  it('maps a 400 validation_error envelope to a non-retryable error with fields', async () => {
    const envelope = { error: { code: 'validation_error', message: 'chip is not a known value', fields: { chip: 'use asap, api, aman, or butuh_bantuan' } } }
    const api = createHttpApi(headers, 'https://api.example', (async () => json(envelope, 400)) as unknown as typeof fetch)
    await expect(api.createObservation(body)).rejects.toMatchObject({
      code: 'validation_error',
      message: 'chip is not a known value',
      status: 400,
      retryable: false,
      fields: { chip: 'use asap, api, aman, or butuh_bantuan' },
    })
  })

  it('maps network failure and 5xx to retryable', async () => {
    const down = createHttpApi(headers, 'https://api.example', (async () => { throw new TypeError('x') }) as unknown as typeof fetch)
    await expect(down.createObservation(body)).rejects.toMatchObject({ retryable: true, status: null })
    const err = createHttpApi(headers, 'https://api.example', (async () => new Response('', { status: 503 })) as unknown as typeof fetch)
    await expect(err.createObservation(body)).rejects.toMatchObject({ retryable: true, status: 503 })
  })

  it('does not call ember-api when signed out', async () => {
    const fetchImpl = vi.fn()
    const api = createHttpApi(async () => null, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await expect(api.getDigest()).rejects.toBeInstanceOf(ApiError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('mock api', () => {
  it('fills server fields and maps chip to severity', async () => {
    const api = createMockApi('uid_dedi', 0)
    const stored = await api.createObservation(body)
    expect(stored).toMatchObject({ volunteerId: 'uid_dedi', severity: 'small_flame', immutable: true })
    expect(stored.id).toBeTruthy()
  })

  it('returns WITHDRAW only when the backend rule is simulated', async () => {
    const api = createMockApi('uid_dedi', 0)
    expect((await api.getDigest()).incidents[0].withdraw).toBeNull()
    api.mock.triggerWithdraw()
    const digest = await api.getDigest()
    expect(digest.incidents[0].withdraw?.volunteerIds).toEqual(['uid_dedi'])
    expect(digest.myTasks.some((t) => t.type === 'withdraw' && t.status === 'approved')).toBe(true)
  })

  it('lists fires near the phone only when it has a position, and not the ones the volunteer is on', async () => {
    const api = createMockApi('uid_dedi', 0)
    expect((await api.getDigest()).nearby).toEqual([])
    const near = (await api.getDigest({ lat: -1.849, lng: 110.051 })).nearby ?? []
    expect(near.map((i) => i.id)).toEqual(['inc_near_01', 'inc_near_02'])
    expect(near[0].distanceM).toBeLessThan(near[1].distanceM)
    expect(near[0]).toMatchObject({ crewOnSite: 3, reporterName: 'Sari' })
  })

  it('keeps a join request pending until a supervisor answers, and repeats return the first', async () => {
    const api = createMockApi('uid_dedi', 0)
    const first = await api.requestJoin('inc_near_01')
    expect(first.status).toBe('pending')
    expect(await api.requestJoin('inc_near_01')).toEqual(first)
    expect((await api.getDigest()).myJoinRequests).toEqual([first])
    api.mock.approveJoin('inc_near_01')
    const after = await api.getDigest({ lat: -1.849, lng: 110.051 })
    expect(after.myJoinRequests?.[0].status).toBe('approved')
    expect(after.incidents.some((i) => i.id === 'inc_near_01')).toBe(true)
    expect(after.myTasks.some((t) => t.incidentId === 'inc_near_01' && t.type === 'instruct')).toBe(true)
    expect(after.nearby?.some((i) => i.id === 'inc_near_01')).toBe(false)
  })

  it('rejects a body without coordinates with 400', async () => {
    const api = createMockApi('uid_dedi', 0)
    const bad = { ...body, lat: undefined as unknown as number }
    await expect(api.createObservation(bad)).rejects.toMatchObject({ status: 400, code: 'validation_error', fields: { lat: expect.any(String) } })
  })
})

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

  it('rejects a body without coordinates with 400', async () => {
    const api = createMockApi('uid_dedi', 0)
    const bad = { ...body, lat: undefined as unknown as number }
    await expect(api.createObservation(bad)).rejects.toMatchObject({ status: 400, code: 'validation_error', fields: { lat: expect.any(String) } })
  })
})

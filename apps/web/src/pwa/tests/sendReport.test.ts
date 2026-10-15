import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../api/types'
import type { ObservationCreate } from '../contracts/types'
import type { LocationResult } from '../report/location'
import { sendReport, type SendDeps, type SendPhase } from '../report/sendReport'

const draft = { chip: 'api' as const, text: 'Small flame', capturedAt: '2026-10-17T03:02:00Z' }
const pos = { lat: -1.8492, lng: 110.0508, accuracyM: 12 }
const ok: LocationResult = { kind: 'ok', pos }

function deps(over: Partial<SendDeps> = {}) {
  const phases: SendPhase[] = []
  const create = vi.fn<[ObservationCreate], Promise<unknown>>(async () => ({}))
  const d: SendDeps = { locate: async () => ok, create, onPhase: (p) => phases.push(p), ...over }
  return { d, phases, create }
}

describe('sendReport', () => {
  it('locates, then sends the built body', async () => {
    const { d, phases, create } = deps()
    expect(await sendReport(draft, d)).toEqual({ kind: 'sent' })
    expect(phases).toEqual(['locating', 'sending'])
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ source: 'chip', chip: 'api', lat: pos.lat, lng: pos.lng, capturedAt: draft.capturedAt }))
  })

  it('stays in the locating step, with no failure, while the permission prompt is open', async () => {
    let answer!: (r: LocationResult) => void
    const { d, phases, create } = deps({ locate: () => new Promise((res) => (answer = res)) })
    const result = sendReport(draft, d)
    await Promise.resolve()
    expect(phases).toEqual(['locating'])
    expect(create).not.toHaveBeenCalled()
    answer(ok)
    expect(await result).toEqual({ kind: 'sent' })
    expect(phases).toEqual(['locating', 'sending'])
  })

  it('sends in the same call once Allow is tapped, with no second tap', async () => {
    const { d, create } = deps({ locate: () => new Promise((res) => setTimeout(() => res(ok), 5)) })
    expect(await sendReport(draft, d)).toEqual({ kind: 'sent' })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it.each(['denied', 'unavailable'] as const)('reports %s only after the browser says so, and sends nothing', async (kind) => {
    const { d, phases, create } = deps({ locate: async () => ({ kind }) })
    expect(await sendReport(draft, d)).toEqual({ kind: 'no-location', reason: kind })
    expect(phases).toEqual(['locating'])
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects an empty or too long draft before asking for the position', async () => {
    const locate = vi.fn(async () => ok)
    const { d } = deps({ locate })
    expect(await sendReport({ ...draft, chip: null, text: '  ' }, d)).toEqual({ kind: 'invalid', reason: 'empty' })
    expect(await sendReport({ ...draft, text: 'x'.repeat(281) }, d)).toEqual({ kind: 'invalid', reason: 'too_long' })
    expect(locate).not.toHaveBeenCalled()
  })

  it('goes through the outbox when there is one, and reports a queued report', async () => {
    const submit = vi.fn<[ObservationCreate], Promise<'sent' | 'queued'>>(async () => 'queued')
    const { d, create } = deps({ submit })
    expect(await sendReport(draft, d)).toEqual({ kind: 'queued' })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(create).not.toHaveBeenCalled()
    expect(await sendReport(draft, { ...d, submit: async () => 'sent' })).toEqual({ kind: 'sent' })
  })

  it('reports a network failure as retryable', async () => {
    const { d } = deps({ create: async () => Promise.reject(new ApiError('network', 'Network error', null, true)) })
    expect(await sendReport(draft, d)).toEqual({ kind: 'failed', retryable: true, detail: 'Network error' })
  })

  it('reports a server rejection with its field messages, not retryable', async () => {
    const { d } = deps({ create: async () => Promise.reject(new ApiError('validation', 'Bad request', 400, false, { text: 'too long' })) })
    expect(await sendReport(draft, d)).toEqual({ kind: 'failed', retryable: false, detail: 'too long' })
  })

  it('treats an unexpected error as a retryable network failure', async () => {
    const { d } = deps({ create: async () => Promise.reject(new Error('boom')) })
    expect(await sendReport(draft, d)).toMatchObject({ kind: 'failed', retryable: true })
  })
})

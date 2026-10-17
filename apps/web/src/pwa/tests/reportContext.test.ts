import { describe, expect, it, vi } from 'vitest'

import { createHttpApi } from '../api/client'
import { createMockApi } from '../api/mock'
import { ApiError } from '../api/types'
import type { Digest, SentReport } from '../contracts/types'
import { buildObservation } from '../report/buildObservation'
import { startOfLocalDay } from '../report/dayStart'
import { deviceOf, networkNow } from '../report/deviceInfo'
import { buildPhotoObservation } from '../photo/uploadPhoto'
import { watchJoin, WATCH_EVERY_MS, WATCH_FIRST_MS, WATCH_MAX_TRIES, type WatchTimers } from '../report/useJoinWatch'

const pos = { lat: -1.8492, lng: 110.0508, accuracyM: 12 }
const capturedAt = '2026-10-17T03:02:00.000Z'

describe('device facts sent with a report', () => {
  it('reads the network in the contract’s words and says nothing where the browser does not', () => {
    expect(networkNow({ connection: { effectiveType: '4g' } })).toBe('4g')
    expect(networkNow({ connection: { effectiveType: 'slow-2g' } })).toBe('2g')
    expect(networkNow({ connection: { effectiveType: '3g', type: 'wifi' } })).toBe('wifi')
    expect(networkNow({ connection: { effectiveType: 'something' } })).toBeUndefined()
    expect(networkNow({})).toBeUndefined()
    expect(networkNow(undefined)).toBeUndefined()
  })

  it('keeps the battery a whole percent from 0 to 100 and leaves out what is unknown', () => {
    expect(deviceOf(41.6, 'id', '3g')).toEqual({ batteryPct: 42, network: '3g', language: 'id' })
    expect(deviceOf(null, 'en', undefined)).toEqual({ language: 'en' })
    expect(deviceOf(140, 'en', undefined)).toEqual({ batteryPct: 100, language: 'en' })
    expect(deviceOf(Number.NaN, 'en', undefined)).toEqual({ language: 'en' })
  })

  it('rides along on a chip report and a photo report, and is left off when there is none', () => {
    const device = { batteryPct: 41, network: '3g' as const, language: 'id' as const }
    expect(buildObservation({ chip: 'api', text: '', capturedAt, device }, pos).device).toEqual(device)
    expect('device' in buildObservation({ chip: 'api', text: '', capturedAt }, pos)).toBe(false)
    expect(buildPhotoObservation('photos/u/x.jpg', capturedAt, pos, '', device).device).toEqual(device)
    expect('device' in buildPhotoObservation('photos/u/x.jpg', capturedAt, pos)).toBe(false)
  })
})

describe('start of the local day', () => {
  it('is local midnight with the phone’s zone offset', () => {
    const value = startOfLocalDay(new Date(2026, 9, 17, 14, 12))
    expect(value).toMatch(/^2026-10-17T00:00:00[+-]\d\d:\d\d$/)
    expect(Date.parse(value)).toBe(new Date(2026, 9, 17).getTime())
  })
})

describe('asking for today’s sent list', () => {
  const digest: Digest = { updatedAt: capturedAt, incidents: [], myTasks: [] }
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  const headers = async () => ({ Authorization: 'Bearer t', 'X-Firebase-AppCheck': 'a' })

  it('puts sentSince in the query with the zone plus encoded, beside the position', async () => {
    const fetchImpl = vi.fn(async () => json(digest))
    const api = createHttpApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await api.getDigest({ lat: 1.5, lng: 102 }, { sentSince: '2026-10-17T00:00:00+05:30' })
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('https://api.example/digest?lat=1.50000&lng=102.00000&sentSince=2026-10-17T00%3A00%3A00%2B05%3A30')
    await api.getDigest(null, { sentSince: '2026-10-17T00:00:00Z' })
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toBe('https://api.example/digest?sentSince=2026-10-17T00%3A00%3A00Z')
    await api.getDigest()
    expect((fetchImpl.mock.calls[2] as unknown as [string])[0]).toBe('https://api.example/digest')
  })

  it('the mock lists a report with where it went, only when asked', async () => {
    const api = createMockApi('uid_dedi', 0)
    const created = await api.createObservation(buildObservation({ chip: 'api', text: '', capturedAt }, pos))
    expect(created.join).toMatchObject({ joined: true, nearbyCount: 1, radiusM: 300 })
    expect((await api.getDigest()).sentToday).toBeUndefined()
    const listed = (await api.getDigest(null, { sentSince: '2026-01-01T00:00:00Z' })).sentToday
    expect(listed).toHaveLength(1)
    expect(listed?.[0]).toMatchObject({ id: created.id, capturedAt, chip: 'api', join: created.join })
    expect((await api.getDigest(null, { sentSince: '2999-01-01T00:00:00Z' })).sentToday).toEqual([])
  })
})

describe('watching for where a report was placed', () => {
  function clock() {
    const queue: Array<{ fn: () => void; ms: number; live: boolean }> = []
    const timers: WatchTimers = {
      set: (fn, ms) => {
        const t = { fn, ms, live: true }
        queue.push(t)
        return t
      },
      clear: (h) => {
        const timer = h as { live: boolean }
        timer.live = false
      },
    }
    const fire = async () => {
      const t = queue.filter((x) => x.live).pop()
      if (!t) throw new Error('no timer')
      t.live = false
      t.fn()
      await new Promise((r) => setTimeout(r, 0))
    }
    return { timers, queue, fire }
  }
  const report = { volunteerId: 'vol_1', capturedAt, sentSince: '2026-10-17T00:00:00Z' }
  const row = (join: SentReport['join']): SentReport => ({ id: 'obs_1', capturedAt, receivedAt: capturedAt, source: 'chip', chip: 'api', text: null, accuracyM: 12, join })
  const join = { incidentId: 'inc_1', incidentName: 'TOHOR-3', incidentArea: null, joined: true, nearbyCount: 2, nearestM: 90, radiusM: 300 }

  it('asks again until the report has its join, then stops', async () => {
    const answers = [{ sentToday: [] }, { sentToday: [row(null)] }, { sentToday: [row(join)] }]
    let call = 0
    const getDigest = vi.fn(async (): Promise<Digest> => ({ updatedAt: capturedAt, incidents: [], myTasks: [], ...answers[Math.min(call++, 2)] }))
    const found = vi.fn()
    const { timers, queue, fire } = clock()
    watchJoin({ api: { getDigest }, report, onFound: found, timers })
    expect(queue[0].ms).toBe(WATCH_FIRST_MS)
    await fire()
    await fire()
    expect(found).not.toHaveBeenCalled()
    expect(queue[queue.length - 1].ms).toBe(WATCH_EVERY_MS)
    await fire()
    expect(found).toHaveBeenCalledTimes(1)
    expect(found.mock.calls[0][0].join).toEqual(join)
    expect(getDigest).toHaveBeenCalledWith(null, { sentSince: report.sentSince })
    expect(queue.filter((t) => t.live)).toHaveLength(0)
  })

  it('keeps trying through a failed read and gives up after about a minute', async () => {
    const getDigest = vi.fn(async () => {
      throw new ApiError('network', 'down', null, true)
    })
    const found = vi.fn()
    const { timers, queue, fire } = clock()
    watchJoin({ api: { getDigest }, report, onFound: found, timers })
    for (let i = 0; i < WATCH_MAX_TRIES; i += 1) await fire()
    expect(getDigest).toHaveBeenCalledTimes(WATCH_MAX_TRIES)
    expect(queue.filter((t) => t.live)).toHaveLength(0)
    expect(found).not.toHaveBeenCalled()
  })

  it('stops when told to, even with a read in flight', async () => {
    let release: (d: Digest) => void = () => undefined
    const getDigest = vi.fn(() => new Promise<Digest>((r) => (release = r)))
    const found = vi.fn()
    const { timers, fire } = clock()
    const stop = watchJoin({ api: { getDigest }, report, onFound: found, timers })
    await fire()
    stop()
    release({ updatedAt: capturedAt, incidents: [], myTasks: [], sentToday: [row(join)] })
    await new Promise((r) => setTimeout(r, 0))
    expect(found).not.toHaveBeenCalled()
  })
})

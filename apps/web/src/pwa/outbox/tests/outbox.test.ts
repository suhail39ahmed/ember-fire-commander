import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import type { Observation, ObservationRequest } from '../../contracts/types'
import { ApiError } from '../../api/types'
import { createMockApi } from '../../api/mock'
import { UploadError } from '../../photo/upload'
import { buildObservation } from '../../report/buildObservation'
import { KEEP_SENT_MS, Outbox, type OutboxDeps } from '../outbox'
import { createIdbStore, createMemoryStore, type OutboxStore } from '../store'
import type { OutboxItem } from '../types'

const pos = { lat: -1.8492, lng: 110.0508, accuracyM: 15 }
const chip = buildObservation({ chip: 'api', text: '', capturedAt: '2026-10-17T03:02:00Z' }, pos)
const note = buildObservation({ chip: null, text: 'Asap tipis', capturedAt: '2026-10-17T03:04:00Z' }, pos)
const offline = () => Promise.reject(new ApiError('network', 'Network error', null, true))

function recorder() {
  const sent: ObservationRequest[] = []
  const send = vi.fn(async (body: ObservationRequest): Promise<Observation> => {
    sent.push(body)
    return { id: `obs_${sent.length}` } as Observation
  })
  return { sent, send }
}

let ids = 0
function outbox(store: OutboxStore, deps: Partial<OutboxDeps> = {}) {
  return new Outbox({
    store,
    send: offline,
    uploadPhoto: () => Promise.reject(new UploadError('network', null)),
    newId: () => `item_${++ids}`,
    ...deps,
  })
}

const states = (items: OutboxItem[]) => items.map((i) => i.state)

describe('outbox', () => {
  it('queues reports while offline and replays each exactly once after a reload, keeping capturedAt', async () => {
    const factory = new IDBFactory()
    const before = outbox(createIdbStore(factory, 'ember-outbox-test'))
    expect((await before.submit(note)).state).toBe('queued')
    expect((await before.submit(chip)).state).toBe('queued')
    expect(states(before.list())).toEqual(['queued', 'queued'])

    // Reload: a new page with the same IndexedDB.
    const { sent, send } = recorder()
    const after = outbox(createIdbStore(factory, 'ember-outbox-test'), { send })
    await after.load()
    expect(states(after.list())).toEqual(['queued', 'queued'])
    await after.flush()
    await after.flush()

    expect(send).toHaveBeenCalledTimes(2)
    expect(sent.map((b) => b.capturedAt)).toEqual(['2026-10-17T03:02:00Z', '2026-10-17T03:04:00Z'])
    const [firstItem, secondItem] = after.list()
    expect(sent).toEqual([
      { ...chip, clientId: firstItem.id },
      { ...note, clientId: secondItem.id },
    ])
    expect(states(after.list())).toEqual(['sent', 'sent'])
    expect(after.list().map((i) => i.observationId)).toEqual(['obs_1', 'obs_2'])

    // A second reload does not send them again.
    const again = recorder()
    const third = outbox(createIdbStore(factory, 'ember-outbox-test'), { send: again.send })
    await third.flush()
    expect(again.send).not.toHaveBeenCalled()
    expect(states(third.list())).toEqual(['sent', 'sent'])
  })

  it('sends straight away when online', async () => {
    const { send } = recorder()
    const box = outbox(createMemoryStore(), { send })
    const item = await box.submit(chip)
    expect(item.state).toBe('sent')
    expect(send).toHaveBeenCalledWith({ ...chip, clientId: item.id })
  })

  it('sends the item id as clientId, and the same one on every replay of that item', async () => {
    // The server stores the report, but the reply is lost, so the outbox sees a network error.
    const server = new Map<string, ObservationRequest>()
    let lostReply = true
    const send = vi.fn(async (body: ObservationRequest): Promise<Observation> => {
      const key = body.clientId ?? `anon_${server.size}`
      const existing = server.has(key)
      server.set(key, server.get(key) ?? body)
      if (lostReply && !existing) throw new ApiError('network', 'Network error', null, true)
      return { id: `obs_${key}` } as Observation
    })
    const box = outbox(createMemoryStore(), { send })
    const item = await box.submit(chip)
    expect(item.state).toBe('queued')

    lostReply = false
    await box.flush()

    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls.map(([body]) => body.clientId)).toEqual([item.id, item.id])
    expect(server.size).toBe(1)
    expect(box.list().map((i) => i.state)).toEqual(['sent'])
    expect(box.list()[0].observationId).toBe(`obs_${item.id}`)
  })

  it('gives each report its own clientId', async () => {
    const { sent, send } = recorder()
    const box = outbox(createMemoryStore(), { send })
    await box.submit(chip)
    await box.submit(note)
    expect(new Set(sent.map((b) => b.clientId)).size).toBe(2)
  })

  it('keeps the clientId when a report interrupted mid-send is replayed after a reload', async () => {
    const store = createMemoryStore()
    const first = outbox(store, { send: () => new Promise<Observation>(() => undefined) })
    const pending = await first.enqueue(chip)
    void first.flush()
    await vi.waitFor(async () => expect((await store.all())[0].state).toBe('sending'))

    const { sent, send } = recorder()
    const reloaded = outbox(store, { send })
    await reloaded.flush()
    expect(sent.map((b) => b.clientId)).toEqual([pending.id])
  })

  it('shares one replay between concurrent triggers', async () => {
    const store = createMemoryStore()
    await outbox(store).enqueue(chip)
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const send = vi.fn(async () => {
      await gate
      return { id: 'obs_1' } as Observation
    })
    const box = outbox(store, { send })
    const runs = [box.flush(), box.flush(), box.flush()]
    release()
    await Promise.all(runs)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('puts an item interrupted mid-send back in the queue', async () => {
    const store = createMemoryStore()
    await store.put({
      id: 'item_x',
      body: chip,
      photo: null,
      state: 'sending',
      attempts: 1,
      lastError: null,
      queuedAt: '2026-10-17T03:02:01Z',
      sentAt: null,
      observationId: null,
    })
    const box = outbox(store)
    await box.load()
    expect(states(box.list())).toEqual(['queued'])
  })

  it('marks a report the API rejects on replay as failed and keeps it', async () => {
    const store = createMemoryStore()
    await outbox(store).submit(chip)
    const reject = vi.fn(() => Promise.reject(new ApiError('validation_error', 'bad', 400, false, { chip: 'use asap' })))
    const box = outbox(store, { send: reject })
    await box.flush()
    const [item] = box.list()
    expect(item.state).toBe('failed')
    expect(item.lastError).toBe('use asap')
    expect((await store.all())[0].state).toBe('failed')

    const { send } = recorder()
    const retried = outbox(store, { send })
    await retried.load()
    await retried.retry(item.id)
    expect(states(retried.list())).toEqual(['sent'])
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('throws a first-attempt rejection back to the form and does not keep the item', async () => {
    const store = createMemoryStore()
    const box = outbox(store, { send: () => Promise.reject(new ApiError('validation_error', 'bad', 400, false)) })
    await expect(box.submit(chip)).rejects.toMatchObject({ code: 'validation_error', status: 400 })
    expect(box.list()).toEqual([])
    expect(await store.all()).toEqual([])
  })

  it('keeps reports when the token is missing or expired', async () => {
    const box = outbox(createMemoryStore(), { send: () => Promise.reject(new ApiError('unauthorized', 'Not signed in', 401, false)) })
    expect((await box.submit(chip)).state).toBe('queued')
  })

  it('discards a failed item', async () => {
    const store = createMemoryStore()
    const box = outbox(store, { send: () => Promise.reject(new ApiError('validation_error', 'bad', 400, false)) })
    const item = await box.enqueue(chip)
    await box.flush()
    await box.discard(item.id)
    expect(box.list()).toEqual([])
    expect(await store.all()).toEqual([])
  })

  it('drops sent items after a day', async () => {
    const store = createMemoryStore()
    const now = new Date('2026-10-18T03:00:00Z')
    await store.put({
      id: 'old',
      body: chip,
      photo: null,
      state: 'sent',
      attempts: 1,
      lastError: null,
      queuedAt: '2026-10-17T02:00:00Z',
      sentAt: new Date(now.getTime() - KEEP_SENT_MS - 1).toISOString(),
      observationId: 'obs_1',
    })
    const box = outbox(store, { now: () => now })
    await box.load()
    expect(box.list()).toEqual([])
  })

  it('uploads a photo saved offline after a reload, then sends only its private path', async () => {
    const factory = new IDBFactory()
    const blob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' })
    const before = outbox(createIdbStore(factory, 'ember-outbox-photo'))
    await before.enqueuePhoto({ blob, contentType: 'image/jpeg', capturedAt: '2026-10-17T03:06:00Z', pos })

    const api = createMockApi('uid_dedi', 0)
    const issued: string[] = []
    const uploadPhoto = vi.fn(async (b: Blob) => {
      expect(await b.text()).toBe('jpeg-bytes')
      const target = await api.createUploadUrl('image/jpeg')
      issued.push(target.photoPath)
      return target.photoPath
    })
    const { sent, send } = recorder()
    const after = outbox(createIdbStore(factory, 'ember-outbox-photo'), { send, uploadPhoto })
    await after.flush()

    expect(uploadPhoto).toHaveBeenCalledTimes(1)
    expect(sent).toEqual([
      { source: 'photo', capturedAt: '2026-10-17T03:06:00Z', lat: pos.lat, lng: pos.lng, accuracyM: 15, chip: null, text: null, photoPath: issued[0], clientId: (await createIdbStore(factory, 'ember-outbox-photo').all())[0].id },
    ])
    const [stored] = await createIdbStore(factory, 'ember-outbox-photo').all()
    expect(stored.state).toBe('sent')
    expect(stored.photo).toBeNull()
  })

  it('keeps the completed photo reference if the report fails after upload', async () => {
    const store = createMemoryStore()
    await outbox(store).enqueuePhoto({ blob: new Blob(['x']), contentType: 'image/jpeg', capturedAt: '2026-10-17T03:06:00Z', pos })
    const uploadPhoto = vi.fn(async () => 'photos/uid_dedi/20261017/abc.jpg')
    const box = outbox(store, { uploadPhoto })
    await box.flush()
    const [item] = box.list()
    expect(item.state).toBe('queued')
    expect(item.body).toMatchObject({ source: 'photo', photoPath: 'photos/uid_dedi/20261017/abc.jpg' })
    expect(item.photo).toBeNull()

    const { send } = recorder()
    const next = outbox(store, { send, uploadPhoto })
    await next.flush()
    expect(uploadPhoto).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(1)
  })
})

/**
 * Offline report outbox (#21).
 *
 * Reports go into IndexedDB first, then replay in capture order. Each item
 * is marked `sending` before its request and `sent` as soon as ember-api
 * answers, so a stored report is never sent again. `capturedAt` is part of
 * the stored body and is never re-stamped. Every request carries the item id as
 * `clientId`, so a replay after a lost reply cannot create a second observation.
 */
import type { Observation, ObservationRequest, PhotoContentType, VideoContentType } from '../contracts/types'
import { ApiError } from '../api/types'
import { UploadError } from '../photo/upload'
import { buildPhotoObservation } from '../photo/uploadPhoto'
import { buildVideoObservation } from '../video/uploadVideo'
import type { OutboxStore } from './store'
import { capturedAtOf, type OutboxItem, type PendingPhoto, type PendingVideo } from './types'

export interface OutboxDeps {
  store: OutboxStore
  send: (body: ObservationRequest) => Promise<Observation>
  /** Uploads a pending photo and resolves with its private object path. */
  uploadPhoto: (blob: Blob, contentType: PhotoContentType) => Promise<string>
  /** Uploads a pending video and resolves with its private object path. Optional; items with video are skipped until this is provided. */
  uploadVideo?: (blob: Blob, contentType: VideoContentType) => Promise<string>
  onChange?: (items: OutboxItem[]) => void
  now?: () => Date
  newId?: () => string
  /** Serialises replay across tabs when the Web Locks API exists. */
  locks?: Pick<LockManager, 'request'> | null
}

/** Sent items stay visible for a day, then are dropped from the phone. */
export const KEEP_SENT_MS = 24 * 60 * 60 * 1000

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function retryable(e: unknown): boolean {
  // Signed out or an expired token: keep the report until the volunteer is signed in again.
  if (e instanceof ApiError && e.status === 401) return true
  if (e instanceof ApiError || e instanceof UploadError) return e.retryable
  return true
}

function message(e: unknown): string {
  if (e instanceof ApiError) return Object.values(e.fields).join('; ') || e.message
  return e instanceof Error ? e.message : String(e)
}

export class Outbox {
  private items = new Map<string, OutboxItem>()
  private flushing: Promise<void> | null = null
  private readonly errors = new Map<string, unknown>()
  private loaded: Promise<void> | null = null
  private readonly now: () => Date
  private readonly newId: () => string

  constructor(private readonly deps: OutboxDeps) {
    this.now = deps.now ?? (() => new Date())
    this.newId = deps.newId ?? randomId
  }

  /** Items in capture order. */
  list(): OutboxItem[] {
    return [...this.items.values()].sort((a, b) => capturedAtOf(a).localeCompare(capturedAtOf(b)) || a.queuedAt.localeCompare(b.queuedAt))
  }

  get pending(): number {
    return this.list().filter((i) => i.state === 'queued').length
  }

  /** Reads IndexedDB once. An item left in `sending` by a closed tab goes back to `queued`. */
  load(): Promise<void> {
    this.loaded ??= (async () => {
      const cutoff = this.now().getTime() - KEEP_SENT_MS
      for (const item of await this.deps.store.all()) {
        if (item.state === 'sent' && item.sentAt && Date.parse(item.sentAt) < cutoff) {
          await this.deps.store.remove(item.id)
          continue
        }
        if (item.state === 'sending') {
          item.state = 'queued'
          await this.deps.store.put(item)
        }
        this.items.set(item.id, item)
      }
      this.emit()
    })()
    return this.loaded
  }

  async enqueue(body: ObservationRequest): Promise<OutboxItem> {
    return this.add({ body, photo: null, video: null })
  }

  /** Keeps a photo whose upload failed, so it survives a reload and uploads later. */
  async enqueuePhoto(photo: PendingPhoto): Promise<OutboxItem> {
    return this.add({ body: null, photo, video: null })
  }

  /** Keeps a video clip whose upload failed, so it survives a reload and uploads later. */
  async enqueueVideo(video: PendingVideo): Promise<OutboxItem> {
    return this.add({ body: null, photo: null, video })
  }

  /**
   * Stores the report, then tries to send everything queued. Resolves with the
   * item after that attempt (`sent` or `queued`). A report the API rejects on
   * its first attempt is removed again and the error is thrown, so the
   * volunteer can correct the draft instead of finding it in the outbox.
   */
  async submit(body: ObservationRequest): Promise<OutboxItem> {
    const item = await this.enqueue(body)
    await this.flush()
    const after = this.items.get(item.id) ?? item
    if (after.state === 'failed' && after.attempts === 1) {
      const error = this.errors.get(item.id)
      await this.discard(item.id)
      throw error ?? new ApiError('rejected', after.lastError ?? 'Rejected', null, false)
    }
    return { ...after }
  }

  async retry(id: string): Promise<void> {
    const item = this.items.get(id)
    if (!item || item.state !== 'failed') return
    await this.save({ ...item, state: 'queued', lastError: null })
    await this.flush()
  }

  async discard(id: string): Promise<void> {
    const item = this.items.get(id)
    if (!item || item.state === 'sending') return
    this.items.delete(id)
    this.errors.delete(id)
    await this.deps.store.remove(id)
    this.emit()
  }

  /** Replays queued items in capture order. Concurrent calls share one run. */
  flush(): Promise<void> {
    this.flushing ??= (async () => {
      try {
        await this.load()
        const locks = this.deps.locks
        // Items added while a run was in progress are picked up by the next pass.
        for (;;) {
          const stopped = locks ? await locks.request('ember-outbox', () => this.replay()) : await this.replay()
          if (stopped || this.pending === 0) break
        }
      } finally {
        this.flushing = null
      }
    })()
    return this.flushing
  }

  /** One pass over the queue. Resolves true when it stopped on a retryable failure. */
  private async replay(): Promise<boolean> {
    // Another tab may have sent items while this one waited for the lock.
    for (const stored of await this.deps.store.all()) this.items.set(stored.id, stored)
    for (const queued of this.list()) {
      if (queued.state !== 'queued') continue
      let item: OutboxItem = { ...queued, state: 'sending', attempts: queued.attempts + 1 }
      await this.save(item)
      try {
        if (!item.body && item.photo) {
          const { blob, contentType, capturedAt, pos } = item.photo
          const photoPath = await this.deps.uploadPhoto(blob, contentType)
          // Keep the completed reference and drop the image bytes.
          item = { ...item, body: buildPhotoObservation(photoPath, capturedAt, pos), photo: null }
          await this.save(item)
        }
        if (!item.body && item.video) {
          if (!this.deps.uploadVideo) throw new Error('Outbox item has a video but no uploadVideo dependency')
          const { blob, contentType, capturedAt, pos } = item.video
          const videoPath = await this.deps.uploadVideo(blob, contentType)
          item = { ...item, body: buildVideoObservation(videoPath, capturedAt, pos), video: null }
          await this.save(item)
        }
        if (!item.body) throw new Error('Outbox item has nothing to send')
        // The item id is the idempotency key: if ember-api stored the report but the reply was lost,
        // the replay gets the stored report back instead of creating a second one.
        const stored = await this.deps.send({ ...item.body, clientId: item.id })
        await this.save({ ...item, state: 'sent', sentAt: this.now().toISOString(), observationId: stored.id, lastError: null })
      } catch (e) {
        this.errors.set(item.id, e)
        const again = retryable(e)
        await this.save({ ...item, state: again ? 'queued' : 'failed', lastError: message(e) })
        // Still offline: stop and wait for the next trigger instead of hammering.
        if (again) return true
      }
    }
    return false
  }

  private async add(fields: Pick<OutboxItem, 'body' | 'photo' | 'video'>): Promise<OutboxItem> {
    await this.load()
    const item: OutboxItem = {
      id: this.newId(),
      ...fields,
      state: 'queued',
      attempts: 0,
      lastError: null,
      queuedAt: this.now().toISOString(),
      sentAt: null,
      observationId: null,
      video: fields.video ?? null,
    }
    await this.save(item)
    return { ...item }
  }

  private async save(item: OutboxItem): Promise<void> {
    await this.deps.store.put(item)
    this.items.set(item.id, item)
    this.emit()
  }

  private emit(): void {
    this.deps.onChange?.(this.list())
  }
}

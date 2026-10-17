import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ObservationRequest } from '../contracts/types'
import type { EmberApi } from '../api/types'
import type { UploadFn } from '../photo/upload'
import { uploadPhoto } from '../photo/uploadPhoto'
import { uploadVideo } from '../video/uploadVideo'
import { Outbox } from './outbox'
import { createIdbStore, createMemoryStore } from './store'
import type { OutboxItem, PendingPhoto, PendingVideo } from './types'

/** While items wait, replay is also tried on this interval (the `online` event is not reliable on every phone). */
const RETRY_MS = 15000

export type SubmitResult = 'sent' | 'queued'

export interface OutboxHandle {
  items: OutboxItem[]
  online: boolean
  submit(body: ObservationRequest): Promise<SubmitResult>
  queuePhoto(photo: PendingPhoto): Promise<void>
  /** Submit a video clip; works like submit for chip/text reports. */
  submitVideo?: (video: PendingVideo) => Promise<SubmitResult>
  /** Keep a video clip that failed to upload so it retries later. */
  queueVideo?: (video: PendingVideo) => Promise<void>
  retry(id: string): Promise<void>
  discard(id: string): Promise<void>
  flush(): Promise<void>
}

export function useOutbox(api: EmberApi, upload: UploadFn): OutboxHandle {
  const [items, setItems] = useState<OutboxItem[]>([])
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  const outbox = useMemo(
    () =>
      new Outbox({
        store: typeof indexedDB === 'undefined' ? createMemoryStore() : createIdbStore(),
        send: (body) => api.createObservation(body),
        uploadPhoto: (blob, contentType) => uploadPhoto(api, upload, blob, contentType),
        uploadVideo: (blob, contentType) => uploadVideo(api, upload, blob, contentType),
        onChange: setItems,
        locks: typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null,
      }),
    [api, upload],
  )

  const flush = useCallback(() => outbox.flush().catch(() => undefined), [outbox])

  useEffect(() => {
    void flush()
    const up = () => {
      setOnline(true)
      void flush()
    }
    const down = () => setOnline(false)
    const visible = () => document.visibilityState === 'visible' && void flush()
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [flush])

  const waiting = items.some((i) => i.state === 'queued')
  useEffect(() => {
    if (!waiting) return
    const id = setInterval(() => void flush(), RETRY_MS)
    return () => clearInterval(id)
  }, [waiting, flush])

  return {
    items,
    online,
    submit: async (body) => ((await outbox.submit(body)).state === 'sent' ? 'sent' : 'queued'),
    queuePhoto: async (photo) => {
      await outbox.enqueuePhoto(photo)
    },
    submitVideo: async (video) => {
      const item = await outbox.enqueueVideo(video)
      await flush()
      const after = outbox.list().find((i) => i.id === item.id) ?? item
      return after.state === 'sent' ? 'sent' : 'queued'
    },
    queueVideo: async (video) => {
      await outbox.enqueueVideo(video)
    },
    retry: (id) => outbox.retry(id),
    discard: (id) => outbox.discard(id),
    flush,
  }
}

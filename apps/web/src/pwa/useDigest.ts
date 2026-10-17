import { useCallback, useEffect, useRef, useState } from 'react'

import type { EmberApi } from './api/types'
import type { Digest, DigestPosition } from './contracts/types'
import { DigestPoller, type PollFailure } from './digestPoll'

export type DigestStatus = 'loading' | 'ready' | PollFailure

export interface DigestState {
  digest: Digest | null
  status: DigestStatus
  /** Phone time of the last successful read, or null before the first one. Home and No signal show it. */
  lastSyncAt: string | null
  /** Read now (Try again, notification tap). */
  refresh: () => void
}

const isActive = () =>
  (typeof document === 'undefined' || document.visibilityState === 'visible') &&
  (typeof navigator === 'undefined' || navigator.onLine !== false)

/**
 * The volunteer's digest, kept fresh while the app is visible and online (see DigestPoller).
 * `onSynced` runs after every successful read, with the phone time it arrived.
 * `position` is the phone's latest fix, sent with each read so the answer lists fires near it. It is read at poll
 * time, so a new fix never restarts the poll; the first fix asks for one read straight away.
 */
export function useDigest(
  api: EmberApi,
  onSynced?: (digest: Digest, receivedAt: Date) => void,
  position: DigestPosition | null = null,
): DigestState {
  const [digest, setDigest] = useState<Digest | null>(null)
  const [status, setStatus] = useState<DigestStatus>('loading')
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const poller = useRef<DigestPoller | null>(null)
  const synced = useRef(onSynced)
  synced.current = onSynced
  const latest = useRef(position)
  latest.current = position
  const hasPosition = position !== null

  useEffect(() => {
    const instance = new DigestPoller({
      fetchDigest: () => api.getDigest(latest.current),
      onDigest: (next, receivedAt) => {
        setDigest(next)
        setStatus('ready')
        setLastSyncAt(receivedAt.toISOString())
        synced.current?.(next, receivedAt)
      },
      onFailure: setStatus,
      isActive,
    })
    poller.current = instance
    const changed = () => instance.activityChanged()
    document.addEventListener('visibilitychange', changed)
    window.addEventListener('online', changed)
    window.addEventListener('offline', changed)
    instance.start()
    return () => {
      document.removeEventListener('visibilitychange', changed)
      window.removeEventListener('online', changed)
      window.removeEventListener('offline', changed)
      instance.stop()
      poller.current = null
    }
  }, [api])

  useEffect(() => {
    if (hasPosition) void poller.current?.refresh()
  }, [hasPosition])

  const refresh = useCallback(() => {
    void poller.current?.refresh()
  }, [])

  return { digest, status, lastSyncAt, refresh }
}

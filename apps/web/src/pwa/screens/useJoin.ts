import { useCallback, useRef, useState } from 'react'

import { ApiError, type EmberApi } from '../api/types'

export type JoinFailure = 'network' | 'refused'

export interface JoinAsk {
  /** Ids this phone has just asked for, so the card shows "Request sent" before the next digest read arrives. */
  sent: ReadonlySet<string>
  /** The incident being sent right now, or null. */
  sending: string | null
  failure: JoinFailure | null
  ask: (incidentId: string) => Promise<void>
  clearFailure: () => void
}

/**
 * Asking to join a nearby fire. One call at a time. A 409 (the fire is out, the volunteer is already on it, or
 * the request was answered) is not retried: the next digest read shows the true state.
 */
export function useJoin(api: EmberApi, refresh: () => void): JoinAsk {
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set())
  const [sending, setSending] = useState<string | null>(null)
  const [failure, setFailure] = useState<JoinFailure | null>(null)
  const busy = useRef(false)

  const ask = useCallback(
    async (incidentId: string) => {
      if (busy.current) return
      busy.current = true
      setSending(incidentId)
      setFailure(null)
      try {
        await api.requestJoin(incidentId)
        setSent((prev) => new Set(prev).add(incidentId))
      } catch (error) {
        setFailure(error instanceof ApiError && !error.retryable ? 'refused' : 'network')
      } finally {
        busy.current = false
        setSending(null)
        refresh()
      }
    },
    [api, refresh],
  )

  return { sent, sending, failure, ask, clearFailure: () => setFailure(null) }
}

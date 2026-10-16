import { useCallback, useEffect, useState } from 'react'

import type { EmberApi } from '../api/types'
import { ApiError } from '../api/types'
import type { IncidentDetail } from '../contracts/types'

export type DetailState =
  | { kind: 'loading' }
  | { kind: 'ready'; detail: IncidentDetail }
  /** The incident does not exist, or this volunteer is not on it. The API answers both with 404. */
  | { kind: 'not-found' }
  | { kind: 'error'; retryable: boolean }

/** Maps a failed read to the state the screen shows. Pure, so it is tested without a browser. */
export function detailFailure(error: unknown): DetailState {
  if (error instanceof ApiError && error.status === 404) return { kind: 'not-found' }
  return { kind: 'error', retryable: !(error instanceof ApiError) || error.retryable || error.status === null }
}

/** Reads one incident from `GET /incidents/{id}` when the screen opens, and again on Try again. */
export function useIncidentDetail(api: EmberApi, incidentId: string): { state: DetailState; reload: () => void } {
  const [state, setState] = useState<DetailState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setState({ kind: 'loading' })
    api
      .getIncident(incidentId)
      .then((detail) => live && setState({ kind: 'ready', detail }))
      .catch((error: unknown) => live && setState(detailFailure(error)))
    return () => {
      live = false
    }
  }, [api, incidentId, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, reload }
}

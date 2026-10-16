import { useEffect, useRef } from 'react'

import type { EmberApi } from './api/types'
import { ApiError } from './api/types'
import type { Digest } from './contracts/types'
import { tasksToMarkHeard } from './heard'

/**
 * Tell ember-api when a sent task is on this phone's screen, once per task. A failure that can pass (network,
 * 429, 5xx) is tried again on the next read of the digest; any other refusal is not repeated. The call changes
 * nothing the volunteer sees.
 */
export function useMarkHeard(api: EmberApi, digest: Digest | null, currentTaskId: string | null, withdrawOnScreen: boolean): void {
  const asked = useRef(new Set<string>())
  useEffect(() => {
    for (const id of tasksToMarkHeard(digest, currentTaskId, withdrawOnScreen)) {
      if (asked.current.has(id)) continue
      asked.current.add(id)
      api.markTaskHeard(id).catch((error: unknown) => {
        if (!(error instanceof ApiError) || error.retryable) asked.current.delete(id)
      })
    }
  }, [api, digest, currentTaskId, withdrawOnScreen])
}

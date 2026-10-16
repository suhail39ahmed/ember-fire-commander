import { useEffect, useRef } from 'react'

import type { EmberApi } from '../api/types'
import type { Digest, IncidentDetail } from '../contracts/types'
import { findJoin, type JoinResult, type SentReport } from './joinResult'

const EVERY_MS = 5000
const MAX_TRIES = 12
const MAX_INCIDENTS = 10

/**
 * After a report is sent, ask ember-api which incident it went into, until it is found or about a minute has
 * passed. Each try re-reads the digest and then the first few incidents in it. A try that fails is
 * quietly tried again; the success card never depends on this.
 */
export function useJoinWatch(args: { api: EmberApi; digest: Digest | null; refresh: () => void; sent: SentReport | null; onFound: (join: JoinResult) => void }): void {
  const { api, sent, refresh, onFound } = args
  const digestRef = useRef(args.digest)
  digestRef.current = args.digest
  const foundRef = useRef(onFound)
  foundRef.current = onFound
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const key = sent ? `${sent.volunteerId}@${sent.at}` : null

  useEffect(() => {
    if (!sent) return
    let live = true
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = async () => {
      tries += 1
      refreshRef.current()
      const ids = (digestRef.current?.incidents ?? []).slice(0, MAX_INCIDENTS).map((i) => i.id)
      const details: IncidentDetail[] = []
      for (const id of ids) {
        try {
          details.push(await api.getIncident(id))
        } catch {
          // Not readable yet, or no signal. The next try asks again.
        }
      }
      if (!live) return
      const join = findJoin(sent, details)
      if (join) return foundRef.current(join)
      if (tries < MAX_TRIES) timer = setTimeout(() => void run(), EVERY_MS)
    }
    timer = setTimeout(() => void run(), 1500)
    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
    // `sent` is identified by its key; a re-render with the same report must not restart the watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key])
}

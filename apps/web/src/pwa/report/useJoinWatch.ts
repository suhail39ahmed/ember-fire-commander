import { useEffect, useRef } from 'react'

import type { EmberApi } from '../api/types'
import type { SentReport } from '../contracts/types'
import { findSent } from './joinResult'

export const WATCH_EVERY_MS = 5000
export const WATCH_FIRST_MS = 1500
export const WATCH_MAX_TRIES = 12

export interface WatchedReport {
  volunteerId: string
  /** The `capturedAt` the phone stamped on the report. */
  capturedAt: string
  /** The start of the volunteer's day, with its zone. */
  sentSince: string
}

export interface WatchTimers {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

const realTimers: WatchTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }

/**
 * Ask ember-api for today's sent list until the report is in it with its join, or about a minute has passed. Agents
 * place a report a moment after it is stored, so the first reads may have no join yet. A read that fails is quietly
 * tried again. Returns a function that stops the watch.
 */
export function watchJoin(args: { api: Pick<EmberApi, 'getDigest'>; report: WatchedReport; onFound: (row: SentReport, all: SentReport[]) => void; timers?: WatchTimers }): () => void {
  const { api, report, onFound, timers = realTimers } = args
  let live = true
  let tries = 0
  let handle: unknown
  const run = async () => {
    tries += 1
    try {
      const digest = await api.getDigest(null, { sentSince: report.sentSince })
      if (!live) return
      const row = findSent(digest.sentToday, report.capturedAt)
      if (row?.join) return onFound(row, digest.sentToday ?? [])
    } catch {
      // Not readable yet, or no signal. The next try asks again.
    }
    if (live && tries < WATCH_MAX_TRIES) handle = timers.set(() => void run(), WATCH_EVERY_MS)
  }
  handle = timers.set(() => void run(), WATCH_FIRST_MS)
  return () => {
    live = false
    timers.clear(handle)
  }
}

/** After a report is sent, watch for where it was placed. The success card never depends on this. */
export function useJoinWatch(args: { api: EmberApi; report: WatchedReport | null; onFound: (row: SentReport, all: SentReport[]) => void }): void {
  const { api, report } = args
  const foundRef = useRef(args.onFound)
  foundRef.current = args.onFound
  const key = report ? `${report.volunteerId}@${report.capturedAt}` : null

  useEffect(() => {
    if (!report) return
    return watchJoin({ api, report, onFound: (row, all) => foundRef.current(row, all) })
    // The report is identified by its key; a re-render with the same report must not restart the watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key])
}

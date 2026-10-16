import { Link } from 'react-router-dom'

import type { Task } from '../contracts/types'
import { formatTime } from '../formatTime'
import { t, type Lang } from '../i18n'
import type { OutboxItem } from '../outbox/types'
import { ageMinutes, safetyFirst } from './noSignal'
import { screenStrings } from './strings'

const s = screenStrings.noSignal

/**
 * The offline field card (#150). Only what is still true from the last sync and from this phone: the last
 * instruction and its age, the reports waiting in the outbox, and the battery. A best-signal spot and a last-known
 * wind are not in any payload, so they are not drawn.
 */
export function NoSignalCard({
  lang,
  sinceMs,
  batteryPct,
  task,
  queued,
  nowMs,
}: {
  lang: Lang
  /** Phone time the signal was first seen to be gone. */
  sinceMs: number | null
  batteryPct: number | null
  /** The newest approved task from the last digest, if any. */
  task: Task | null
  queued: OutboxItem[]
  nowMs: number
}) {
  const sentAt = task?.sentAt ?? null
  const age = ageMinutes(sentAt, nowMs)
  const safetyOnTop = safetyFirst(sentAt, nowMs)
  const stale = task !== null && safetyOnTop
  const rule = (
    <section className="card safety-rule" key="rule" data-testid="no-signal-rule">
      <p className="section-label">{t(lang, s.safetyLabel)}</p>
      <p className="rule-text">{t(lang, s.safetyRule)}</p>
    </section>
  )
  const instruction = (
    <section className="card" key="instruction" data-testid="no-signal-instruction">
      <p className="section-label">
        {[t(lang, s.lastInstruction), sentAt && age !== null ? formatTime(sentAt) : null, age !== null ? `${age} ${t(lang, s.minAgo)}` : null].filter(Boolean).join(' · ')}
      </p>
      <p className="rule-text">{task?.instruction || t(lang, s.noInstruction)}</p>
      {stale && <p className="warn small">{t(lang, s.stale)}</p>}
    </section>
  )
  const waiting = queued.filter((q) => q.state !== 'sent')
  const last = waiting.map((q) => q.queuedAt).sort().pop()
  return (
    <>
      <section className="card offline-card" role="status" data-testid="home-offline">
        <h2>
          {t(lang, s.since)} {sinceMs !== null ? formatTime(sinceMs) : '--:--'}
        </h2>
        <p>{t(lang, s.sinceBody)}</p>
        {batteryPct !== null && <p className="muted small">{t(lang, s.battery)} {batteryPct} %</p>}
      </section>
      {safetyOnTop ? [rule, instruction] : [instruction, rule]}
      <section className="card" data-testid="no-signal-saved">
        {waiting.length > 0 ? (
          <>
            <strong>
              {waiting.length} {t(lang, waiting.length === 1 ? s.savedOne : s.saved)}
            </strong>
            <p className="muted small">
              {t(lang, s.savedBody)}
              {last ? ` ${formatTime(last)}` : ''}
            </p>
          </>
        ) : (
          <>
            <strong>{t(lang, s.savedNone)}</strong>
            <p className="muted small">{t(lang, s.savedNoneBody)}</p>
          </>
        )}
      </section>
      <Link className="card link-card" to="/pwa/sms" data-testid="no-signal-sms">
        <strong>{t(lang, s.sms)}</strong>
        <span className="muted small">{t(lang, s.smsBody)}</span>
      </Link>
    </>
  )
}

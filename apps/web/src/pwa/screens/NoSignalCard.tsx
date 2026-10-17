import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

import type { Task } from '../contracts/types'
import { formatTime } from '../formatTime'
import { t, type Lang } from '../i18n'
import type { OutboxItem } from '../outbox/types'
import { ageMinutes, safetyFirst } from './noSignal'
import { screenStrings } from './strings'
import './field.css'

const s = screenStrings.noSignal

function FieldIcon({ kind }: { kind: 'offline' | 'saved' | 'sms' }) {
  const path = kind === 'offline' ? 'm3 3 18 18M4 10a13 13 0 0 1 3-2m4-1a13 13 0 0 1 9 3M8 14a7 7 0 0 1 4-1m4 1 1 1M11 18h2' : kind === 'saved' ? 'M6 3h9l4 4v14H5V3h1m3 0v6h7M8 14h8M8 17h6' : 'M3 4h18v13H8l-5 4V4z'
  return <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
}

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
  queueDetails,
}: {
  lang: Lang
  /** Phone time the signal was first seen to be gone. */
  sinceMs: number | null
  batteryPct: number | null
  /** The newest approved task from the last digest, if any. */
  task: Task | null
  queued: OutboxItem[]
  nowMs: number
  queueDetails?: ReactNode
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
    <div className="no-signal">
      <section className="card offline-card field-row" role="status" data-testid="home-offline">
        <FieldIcon kind="offline" />
        <div>
        <h2>
          {t(lang, s.since)} {sinceMs !== null ? formatTime(sinceMs) : '--:--'}
        </h2>
        <p className="muted small">{t(lang, s.sinceBody)}</p>
        {batteryPct !== null && <p className="muted small">{t(lang, s.battery)} {batteryPct} %</p>}
        </div>
      </section>
      {safetyOnTop ? [rule, instruction] : [instruction, rule]}
      <section className="card field-row" data-testid="no-signal-saved">
        <FieldIcon kind="saved" /><div>
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
        {queueDetails && <details className="field-queue"><summary>{t(lang, s.viewSaved)}</summary>{queueDetails}</details>}
        </div>
      </section>
      <Link className="card link-card field-row" to="/pwa/sms" data-testid="no-signal-sms">
        <FieldIcon kind="sms" /><div><strong>{t(lang, s.sms)}</strong>
        <span className="muted small">{t(lang, s.smsBody)}</span></div>
      </Link>
    </div>
  )
}

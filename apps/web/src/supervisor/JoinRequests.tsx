import { useState } from 'react'
import { Link } from 'react-router-dom'

import { ApiError } from '../pwa/api/types'
import { t, type Lang } from '../pwa/i18n'
import { approvalsCopy } from './approvalsCopy'
import type { PendingJoinRequest } from './contracts'
import { consoleIncidentPath } from './paths'
import './supervisor.css'

export const JOIN_INSTRUCTION_MAX = 500

export interface JoinRequestsProps {
  lang: Lang
  items: PendingJoinRequest[]
  offline: boolean
  onApprove: (id: string, instruction: string) => Promise<void>
  onDecline: (id: string) => Promise<void>
}

type Failure = 'conflict' | 'invalid' | 'failed' | null

function failureOf(error: unknown): Failure {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'conflict'
    if (error.status === 400) return 'invalid'
  }
  return 'failed'
}

function JoinRequestRow({ lang, item, offline, onApprove, onDecline }: Omit<JoinRequestsProps, 'items'> & { item: PendingJoinRequest }) {
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure>(null)
  const id = item.request.id
  const who = (item.volunteerName?.trim() || t(lang, approvalsCopy.volunteerFallback)).toUpperCase()
  const text = instruction.trim()
  const valid = text.length > 0 && instruction.length <= JOIN_INSTRUCTION_MAX
  const off = busy || offline

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setFailure(null)
    try {
      await action()
    } catch (error) {
      setFailure(failureOf(error))
    }
    setBusy(false)
  }

  const failureText = failure === 'conflict'
    ? approvalsCopy.joinConflict
    : failure === 'invalid'
      ? approvalsCopy.joinInvalid
      : failure === 'failed'
        ? approvalsCopy.joinFailed
        : null

  return (
    <li className="prop instruct join-row" data-testid={`join-${id}`}>
      <div className="prop-row">
        <div className="prop-main">
          <p className="prop-eyebrow">{t(lang, approvalsCopy.joinAsks)} · {who}</p>
          <p className="prop-text">{t(lang, approvalsCopy.joinHelp)}</p>
          <label className="join-label" htmlFor={`join-text-${id}`}>{t(lang, approvalsCopy.joinInstructionLabel)}</label>
          <textarea
            id={`join-text-${id}`}
            className="join-instruction"
            value={instruction}
            maxLength={JOIN_INSTRUCTION_MAX}
            disabled={off}
            placeholder={t(lang, approvalsCopy.joinInstructionHint)}
            onChange={(event) => { setInstruction(event.target.value); setFailure(null) }}
          />
        </div>
        <div className="prop-actions">
          <button type="button" className="inc-btn" disabled={off} onClick={() => void run(() => onDecline(id))}>
            {t(lang, approvalsCopy.joinDecline)}
          </button>
          <button type="button" className="inc-btn inc-btn-ink" disabled={off || !valid} onClick={() => void run(() => onApprove(id, text))}>
            {t(lang, approvalsCopy.joinApprove)}
          </button>
        </div>
      </div>
      {failureText && <p className="sup-error" role="alert">{t(lang, failureText)}</p>}
    </li>
  )
}

/** Volunteers near a fire who asked to join it. Approve needs a first instruction, and sends it. */
export function JoinRequests({ lang, items, offline, onApprove, onDecline }: JoinRequestsProps) {
  if (items.length === 0) return null
  return (
    <section className="approvals-group" aria-label={t(lang, approvalsCopy.joinTitle)}>
      <h2 className="approvals-incident">{t(lang, approvalsCopy.joinTitle)}</h2>
      {items.map((item) => (
        <div key={item.request.id} className="join-block">
          {item.incident ? (
            <p className="join-incident"><Link to={consoleIncidentPath(item.incident.id)}>{item.incident.label}</Link></p>
          ) : (
            <p className="join-incident">{t(lang, approvalsCopy.noIncident)}</p>
          )}
          <ul className="prop-list">
            <JoinRequestRow lang={lang} item={item} offline={offline} onApprove={onApprove} onDecline={onDecline} />
          </ul>
        </div>
      ))}
    </section>
  )
}

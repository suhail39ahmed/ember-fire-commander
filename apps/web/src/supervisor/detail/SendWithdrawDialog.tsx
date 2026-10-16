import { useState } from 'react'

import { incidentLabel } from '../../pwa/incidentName'
import { t, type Lang } from '../../pwa/i18n'
import type { Incident, IncidentDecision, WithdrawRequest } from '../contracts'
import { detailCopy } from './copy'
import { Modal } from './Modal'
import type { VolunteerRow } from './model'
import {
  buildRequest, defaultInstruction, formProblem, initialSelection, problemText, recipientDetail, recipientName, submitWithdraw,
  toggleSelection,
} from './withdrawModel'
import { withdrawCopy } from './withdrawCopy'

export interface SendWithdrawDialogProps {
  lang: Lang
  incident: Incident
  /** Volunteers already on the incident. The route refuses anyone else. */
  rows: VolunteerRow[]
  /** True while ember-api cannot be reached. The dialog stays, sending is blocked. */
  offline: boolean
  send(request: WithdrawRequest): Promise<IncidentDecision>
  /** Called after the route confirmed. */
  onSent(count: number, auditId: string): void
  /** Cancel, Escape and the backdrop. Writes nothing. */
  onClose(): void
}

/** WITHDRAW now, to the volunteers selected on this incident. No approval step. */
export function SendWithdrawDialog({ lang, incident, rows, offline, send, onSent, onClose }: SendWithdrawDialogProps) {
  const [selected, setSelected] = useState(() => initialSelection(rows))
  const [instruction, setInstruction] = useState(defaultInstruction)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const problem = formProblem(selected, instruction)

  const submit = async () => {
    if (problem || sending || offline) return
    setSending(true)
    setError(null)
    const result = await submitWithdraw(send, buildRequest(rows, selected, instruction), lang)
    setSending(false)
    if (result.ok) onSent(result.count, result.auditId)
    else setError(result.message)
  }

  return (
    <Modal title={`${t(lang, withdrawCopy.title)} ${incidentLabel(incident)}`} onClose={onClose} dismissible={!sending}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <fieldset className="inc-choices">
          <legend className="inc-modal-label">{t(lang, withdrawCopy.recipients)}</legend>
          {rows.length === 0 && <p className="inc-muted">{t(lang, withdrawCopy.noRecipients)}</p>}
          {rows.map((row) => {
            const on = selected.includes(row.id)
            return (
              <label key={row.id} className={on ? 'inc-choice on' : 'inc-choice'}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={sending}
                  onChange={() => setSelected((current) => toggleSelection(current, row.id))}
                />
                <span className="inc-choice-name">{recipientName(row, lang)}</span>
                <span className="inc-muted">{recipientDetail(row, lang)}</span>
              </label>
            )
          })}
        </fieldset>

        <label className="inc-modal-label" htmlFor="withdraw-instruction">{t(lang, withdrawCopy.instruction)}</label>
        <textarea
          id="withdraw-instruction"
          className="inc-input"
          rows={3}
          value={instruction}
          disabled={sending}
          aria-describedby="withdraw-hint"
          onChange={(event) => setInstruction(event.target.value)}
        />
        <p className="inc-modal-note" id="withdraw-hint">{t(lang, withdrawCopy.hint)}</p>

        {problem && selected.length > 0 && <p className="inc-modal-note" role="status">{problemText(problem, lang)}</p>}
        {error && <p className="inc-modal-error" role="alert">{error}</p>}

        <div className="inc-modal-actions">
          <button type="button" className="inc-btn inc-btn-plain" disabled={sending} onClick={onClose}>
            {t(lang, withdrawCopy.cancel)}
          </button>
          <button type="submit" className="inc-btn inc-btn-danger" disabled={problem !== null || sending || offline}>
            {offline ? t(lang, detailCopy.offlineSend) : sending ? t(lang, withdrawCopy.sending) : `${t(lang, withdrawCopy.send)} ${selected.length}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}

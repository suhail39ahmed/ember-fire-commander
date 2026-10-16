import { useState } from 'react'

import { t, type Lang } from '../../pwa/i18n'
import type { IncidentDetail, Task } from '../contracts'
import { OutcomeLine, type IncidentActions } from '../IncidentView'
import { taskControls } from '../view'
import { taskCopy } from './copy'
import { disagreeCopy } from './disagreeCopy'
import { nameOf } from './model'
import './disagree.css'

/**
 * A task waiting for the supervisor: what it is, who it is for, the instruction, and Edit, Reject and Approve.
 * Approve for a dispatch is off while the incident has an open conflict, and the line under it says why.
 * `offline` blocks every write button: nothing is queued.
 */
export function ProposalRow({ lang, task, detail, actions, offline }: { lang: Lang; task: Task; detail: IncidentDetail; actions: IncidentActions; offline: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.instruction ?? '')
  const { approveBlocked } = taskControls(task, detail)
  const busy = actions.busyId === task.id || offline
  const who = nameOf(detail, task.volunteerId, lang).toUpperCase()
  return (
    <li className={`prop ${task.type}`}>
      <div className="prop-row">
        <div className="prop-main">
          <p className="prop-eyebrow">{t(lang, taskCopy.type[task.type]).toUpperCase()} · {t(lang, disagreeCopy.proposedWord)} · {who}</p>
          {editing ? (
            <form
              className="sup-edit"
              onSubmit={(e) => {
                e.preventDefault()
                actions.onEdit(task.id, draft)
                setEditing(false)
              }}
            >
              <label>
                {t(lang, taskCopy.instruction)}
                <textarea value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} />
              </label>
              <div className="sup-buttons">
                <button type="submit" className="btn-ink" disabled={busy || !draft.trim()}>{t(lang, taskCopy.save)}</button>
                <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>{t(lang, taskCopy.cancel)}</button>
              </div>
            </form>
          ) : (
            <p className="prop-text">{task.instruction ?? '—'}</p>
          )}
        </div>
        {!editing && (
          <div className="prop-actions">
            <button type="button" className="prop-link" disabled={busy} onClick={() => { setDraft(task.instruction ?? ''); setEditing(true) }}>
              {t(lang, taskCopy.edit)}
            </button>
            <button type="button" className="inc-btn" disabled={busy} onClick={() => actions.onReject(task.id)}>
              {t(lang, taskCopy.reject)}
            </button>
            <button type="button" className="inc-btn inc-btn-ink" disabled={busy || approveBlocked !== null} onClick={() => actions.onApprove(task.id)}>
              {t(lang, taskCopy.approve)}
            </button>
          </div>
        )}
      </div>
      {approveBlocked && <p className="prop-held" role="note">{t(lang, disagreeCopy.heldLine)}</p>}
      <OutcomeLine outcome={actions.outcomes[task.id]} lang={lang} />
    </li>
  )
}

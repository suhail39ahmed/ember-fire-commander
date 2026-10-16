import { useState } from 'react'

import { t, type Lang } from '../../pwa/i18n'
import type { IncidentDetail, Task } from '../contracts'
import { OutcomeLine, type IncidentActions } from '../IncidentView'
import { taskControls } from '../view'
import { taskCopy } from './copy'
import { disagreeCopy } from './disagreeCopy'
import { EditInstructionDialog } from './EditInstructionDialog'
import { nameOf } from './model'
import './disagree.css'

/**
 * A task waiting for the supervisor: what it is, who it is for, the instruction, and Edit, Reject and Approve.
 * Approve for a dispatch is off while the incident has an open conflict, and the line under it says why.
 * `offline` blocks every write button: nothing is queued.
 */
export function ProposalRow({ lang, task, detail, actions, offline, editor = '' }: { lang: Lang; task: Task; detail: IncidentDetail; actions: IncidentActions; offline: boolean; editor?: string }) {
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const { approveBlocked } = taskControls(task, detail)
  const busy = actions.busyId === task.id || offline
  const who = nameOf(detail, task.volunteerId, lang).toUpperCase()
  return (
    <li className={`prop ${task.type}`}>
      <div className="prop-row">
        <div className="prop-main">
          <p className="prop-eyebrow">{t(lang, taskCopy.type[task.type]).toUpperCase()} · {t(lang, disagreeCopy.proposedWord)} · {who}</p>
          <p className="prop-text">{task.instruction ?? '—'}</p>
        </div>
        {(
          <div className="prop-actions">
            <button type="button" className="prop-link" disabled={busy} onClick={() => { setSaved(null); setEditing(true) }}>
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
      {saved && <p className="sup-ok" role="status">{saved}</p>}
      {approveBlocked && <p className="prop-held" role="note">{t(lang, disagreeCopy.heldLine)}</p>}
      <OutcomeLine outcome={actions.outcomes[task.id]} lang={lang} />
      {editing && (
        <EditInstructionDialog
          lang={lang}
          task={task}
          incident={detail.incident}
          editor={editor}
          volunteerName={nameOf(detail, task.volunteerId, lang)}
          offline={offline}
          send={(instruction) => actions.saveEdit(task.id, instruction)}
          onSaved={(text) => { setEditing(false); setSaved(text) }}
          onClose={() => setEditing(false)}
        />
      )}
    </li>
  )
}

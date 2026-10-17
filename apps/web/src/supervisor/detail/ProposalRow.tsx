import { useState, type ReactNode } from 'react'

import { t, type Lang } from '../../pwa/i18n'
import type { Incident, IncidentDetail, Task } from '../contracts'
import { OutcomeLine, type IncidentActions } from '../IncidentView'
import { taskControls } from '../view'
import { taskCopy } from './copy'
import { disagreeCopy } from './disagreeCopy'
import { EditInstructionDialog } from './EditInstructionDialog'
import { nameOf } from './model'
import './disagree.css'

/** What a row needs from the incident. The detail page has all of it; the Approvals list builds it from `GET /tasks`. */
export type ProposalDetail = Pick<IncidentDetail, 'conflict' | 'observations' | 'volunteers'> & { incident: Pick<Incident, 'id' | 'name' | 'area'> }

export interface ProposalRowProps {
  lang: Lang
  task: Task
  detail: ProposalDetail
  actions: IncidentActions
  offline: boolean
  editor?: string
  /** The reporter's name when `detail` has no report from them, such as on the Approvals list. */
  volunteerName?: string | null
  /**
   * Retained for callers that only know the incident is on hold (Approvals list). Approve always
   * calls ember-api, which returns the plain-language refusal if the conflict is still open.
   */
  held?: boolean
  /** A line above the proposal, such as the incident it belongs to. */
  heading?: ReactNode
}

/**
 * A task waiting for the supervisor: what it is, who it is for, the instruction, and Edit, Reject and Approve.
 * Approve always calls ember-api so the supervisor sees its exact refusal in plain language via OutcomeLine.
 * `offline` blocks every write button: nothing is queued.
 */
export function ProposalRow({ lang, task, detail, actions, offline, editor = '', volunteerName, heading }: ProposalRowProps) {
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const { canDecide } = taskControls(task, detail)
  const busy = actions.busyId === task.id || offline
  const personName = volunteerName?.trim() || nameOf(detail, task.volunteerId, lang)
  const who = personName.toUpperCase()
  return (
    <li className={`prop ${task.type}`}>
      {heading}
      <div className="prop-row">
        <div className="prop-main">
          <p className="prop-eyebrow">{t(lang, taskCopy.type[task.type]).toUpperCase()} · {t(lang, disagreeCopy.proposedWord)} · {who}</p>
          <p className="prop-text">{task.instruction ?? '—'}</p>
        </div>
        {canDecide && (
          <div className="prop-actions">
            <button type="button" className="prop-link" disabled={busy} onClick={() => { setSaved(null); setEditing(true) }}>
              {t(lang, taskCopy.edit)}
            </button>
            <button type="button" className="inc-btn" disabled={busy} onClick={() => actions.onReject(task.id)}>
              {t(lang, taskCopy.reject)}
            </button>
            <button type="button" className="inc-btn inc-btn-ink" disabled={busy} onClick={() => actions.onApprove(task.id)}>
              {t(lang, taskCopy.approve)}
            </button>
          </div>
        )}
      </div>
      {saved && <p className="sup-ok" role="status">{saved}</p>}
      <OutcomeLine outcome={actions.outcomes[task.id]} lang={lang} />
      {editing && (
        <EditInstructionDialog
          lang={lang}
          task={task}
          incident={detail.incident}
          editor={editor}
          volunteerName={personName}
          offline={offline}
          send={(instruction) => actions.saveEdit(task.id, instruction)}
          onSaved={(text) => { setEditing(false); setSaved(text) }}
          onClose={() => setEditing(false)}
        />
      )}
    </li>
  )
}

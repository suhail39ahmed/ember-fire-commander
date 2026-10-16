import { useId, useState } from 'react'

import { incidentLabel } from '../../pwa/incidentName'
import { t, type Lang } from '../../pwa/i18n'
import type { Incident, Task, TaskDecision } from '../contracts'
import { detailCopy, taskCopy } from './copy'
import { editCopy } from './editCopy'
import { EDIT_MAX, editProblem, savedText, submitEdit } from './editModel'
import { Modal } from './Modal'
import { volunteerLabel } from './model'

export interface EditInstructionDialogProps {
  lang: Lang
  task: Task
  incident: Pick<Incident, 'id' | 'name' | 'area'>
  /** The signed-in supervisor, shown in the note before saving. The saved line uses the name the route returns. */
  editor: string
  /** The volunteer's name as the API gave it. Without one, a short code. */
  volunteerName?: string
  /** True while ember-api cannot be reached. The dialog stays, saving is blocked. */
  offline: boolean
  send(instruction: string): Promise<TaskDecision>
  /** Called after the route confirmed, with the line to show under the task. */
  onSaved(text: string): void
  /** Cancel, Escape and the backdrop. Writes nothing. */
  onClose(): void
}

/** Edit a proposal's instruction. Only the text changes: type, volunteer and incident are shown, not editable. */
export function EditInstructionDialog({ lang, task, incident, editor, volunteerName, offline, send, onSaved, onClose }: EditInstructionDialogProps) {
  const [draft, setDraft] = useState(task.instruction ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fieldId = useId()
  const name = volunteerName?.trim() || volunteerLabel(task.volunteerId, lang)
  const problem = editProblem(draft, task.instruction)
  const length = draft.trim().length

  const submit = async () => {
    if (saving || offline || problem !== null) return
    setSaving(true)
    setError(null)
    const result = await submitEdit(send, task, draft, editor, lang)
    setSaving(false)
    if (result.ok) onSaved(savedText(lang, result.editor, result.auditId))
    else setError(result.message)
  }

  const title = lang === 'en' ? `${t(lang, editCopy.titleFor)} ${name}${t(lang, editCopy.titleSuffix)}` : `${t(lang, editCopy.titleFor)} ${name}`
  return (
    <Modal title={title} onClose={onClose} dismissible={!saving}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className="inc-modal-label" htmlFor={fieldId}>{t(lang, editCopy.field)}</label>
        <textarea
          id={fieldId}
          className="inc-edit-field"
          rows={3}
          value={draft}
          disabled={saving}
          aria-invalid={length > EDIT_MAX || undefined}
          onChange={(event) => { setDraft(event.target.value); setError(null) }}
        />
        <p className={length > EDIT_MAX ? 'inc-edit-count over' : 'inc-edit-count'}>{length} / {EDIT_MAX}</p>
        <dl className="inc-edit-facts" aria-label={t(lang, editCopy.readOnly)}>
          <div><dt>{t(lang, editCopy.factType)}</dt><dd>{t(lang, taskCopy.type[task.type])}</dd></div>
          <div><dt>{t(lang, editCopy.factVolunteer)}</dt><dd>{name}</dd></div>
          <div><dt>{t(lang, editCopy.factIncident)}</dt><dd>{incidentLabel(incident)}</dd></div>
        </dl>
        <p className="inc-modal-note">
          {editor ? `${t(lang, editCopy.note)} ${editor}. ${t(lang, editCopy.noteTail)}` : `${t(lang, editCopy.noteNoName)} ${t(lang, editCopy.noteTail)}`}
        </p>
        {error && <p className="inc-modal-error" role="alert">{error}</p>}
        <div className="inc-modal-actions">
          <button type="button" className="inc-btn inc-btn-plain" disabled={saving} onClick={onClose}>
            {t(lang, editCopy.cancel)}
          </button>
          <button type="submit" className="inc-btn inc-btn-ink" disabled={problem !== null || saving || offline} title={problem === 'unchanged' ? t(lang, editCopy.unchanged) : undefined}>
            {offline ? t(lang, detailCopy.offlineSend) : saving ? t(lang, editCopy.saving) : t(lang, editCopy.save)}
          </button>
        </div>
      </form>
    </Modal>
  )
}

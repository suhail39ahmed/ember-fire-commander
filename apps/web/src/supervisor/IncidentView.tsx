import { useState } from 'react'

import { formatTimeZone } from '../pwa/formatTime'
import { t as tr, type Lang } from '../pwa/i18n'
import { incidentLabel } from '../pwa/incidentName'
import { taskCopy, taskStatusName } from './detail/copy'
import { EditInstructionDialog } from './detail/EditInstructionDialog'
import { helpCopy } from './detail/helpCopy'
import { helpRequests, HELP_CHIP } from './detail/helpModel'
import { nameOf, storedName } from './detail/model'
import { NeedHelpBanner } from './detail/NeedHelpBanner'
import { outcomeText } from './detail/outcomeCopy'
import type { IncidentDetail, Observation, Task, TaskDecision } from './contracts'
import {
  canVerify, conflictPair, SEVERITY_LABEL, STATUS_LABEL, TASK_LABEL, taskControls, withdrawBanner,
} from './view'

/** Last backend answer for one task or incident, shown next to its controls. */
export type OutcomeAction = 'approve' | 'reject' | 'edit' | 'verify'
export type OutcomeReason = 'network' | 'held' | 'not_proposed' | 'withdraw_task' | 'forbidden' | 'not_found' | 'invalid' | 'server'

export interface Outcome {
  kind: 'ok' | 'error'
  text: string
  /** What was done and the audit record, so the detail screen can say it in the supervisor's language. */
  action?: OutcomeAction
  auditId?: string
  /** Why it failed, so the detail screen can say it in the supervisor's language. */
  reason?: OutcomeReason
}

export interface IncidentActions {
  busyId: string | null
  outcomes: Record<string, Outcome>
  onApprove(taskId: string): void
  onReject(taskId: string): void
  /** POST /tasks/{id}/edit, then a fresh read. Resolves with the route's answer and throws the route's refusal. */
  saveEdit(taskId: string, instruction: string): Promise<TaskDecision>
  onVerify(incidentId: string): void
}

function ObservationCard({ obs, detail, lang }: { obs: Observation; detail: IncidentDetail; lang: Lang }) {
  // The Reports panel lists many reporters at once, so a missing name reads as just "Volunteer".
  const name = storedName(detail, obs.volunteerId) ?? (lang === 'id' ? 'Relawan' : 'Volunteer')
  const help = obs.chip === HELP_CHIP
  return (
    <article className={help ? 'sup-obs help' : 'sup-obs'} aria-label={`Report from ${name}`}>
      <p className="sup-obs-who">{name} · {formatTimeZone(obs.capturedAt)}</p>
      <p className={`sup-sev sev-${obs.severity}`}>{SEVERITY_LABEL[obs.severity]}</p>
      {obs.chip && <p className={help ? 'sup-obs-help' : 'sup-muted'}>{help ? tr(lang, helpCopy.badge).toUpperCase() : `Chip: ${obs.chip.replace('_', ' ')}`}</p>}
      {obs.text && <p className="sup-obs-text">“{obs.text}”</p>}
      <p className="sup-muted">Source: {obs.source} · ±{obs.accuracyM ?? '?'} m</p>
    </article>
  )
}

export function OutcomeLine({ outcome, lang }: { outcome?: Outcome; lang?: Lang }) {
  if (!outcome) return null
  return (
    <p className={outcome.kind === 'ok' ? 'sup-ok' : 'sup-error'} role={outcome.kind === 'ok' ? 'status' : 'alert'}>
      {lang ? outcomeText(outcome, lang) : outcome.text}
    </p>
  )
}

/**
 * `offline` blocks every write button: nothing typed while ember-api is unreachable is queued.
 * `editor` is the signed-in supervisor's name, shown in the edit dialog before the route answers.
 */
export function TaskRow({ task, detail, actions, offline = false, lang, editor = '' }: { task: Task; detail: IncidentDetail; actions: IncidentActions; offline?: boolean; lang?: Lang; editor?: string }) {
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const { canDecide, approveBlocked } = taskControls(task, detail)
  const busy = actions.busyId === task.id || offline
  const language: Lang = lang ?? 'en'
  return (
    <li className={`sup-task type-${task.type}`}>
      <div className="sup-task-head">
        <span className="sup-chip">{lang ? tr(lang, taskCopy.type[task.type]) : TASK_LABEL[task.type]}</span>
        <strong>{nameOf(detail, task.volunteerId, language)}</strong>
        <span className={`sup-status status-${task.status}`}>{lang ? tr(lang, taskStatusName[task.status]) : task.status}</span>
      </div>
      <p className="sup-task-text">{task.instruction ?? '—'}</p>
      {canDecide && (
        <div className="sup-buttons">
          <button type="button" className="btn-safe" disabled={busy || approveBlocked !== null} onClick={() => actions.onApprove(task.id)}>
            {lang ? tr(lang, taskCopy.approve) : 'Approve'}
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setSaved(null); setEditing(true) }}>
            {lang ? tr(lang, taskCopy.edit) : 'Edit'}
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => actions.onReject(task.id)}>
            {lang ? tr(lang, taskCopy.reject) : 'Reject'}
          </button>
        </div>
      )}
      {approveBlocked && <p className="sup-hold">{lang ? tr(lang, taskCopy.held) : approveBlocked}</p>}
      {saved && <p className="sup-ok" role="status">{saved}</p>}
      <OutcomeLine outcome={actions.outcomes[task.id]} lang={lang} />
      {editing && (
        <EditInstructionDialog
          lang={language}
          task={task}
          incident={detail.incident}
          editor={editor}
          volunteerName={lang ? nameOf(detail, task.volunteerId, lang) : undefined}
          offline={offline}
          send={(instruction) => actions.saveEdit(task.id, instruction)}
          onSaved={(text) => { setEditing(false); setSaved(text) }}
          onClose={() => setEditing(false)}
        />
      )}
    </li>
  )
}

export function IncidentView({ detail, actions, lang = 'en' }: { detail: IncidentDetail; actions: IncidentActions; lang?: Lang }) {
  const { incident, conflict } = detail
  const banner = withdrawBanner(incident)
  const pair = conflictPair(detail)
  const others = conflict ? [] : detail.observations
  return (
    <section className="sup-incident" aria-label={`Incident ${incidentLabel(incident, lang)}`}>
      <header className="sup-head">
        <div>
          <h1>{incidentLabel(incident, lang)}</h1>
          <p className="sup-muted">
            {STATUS_LABEL[incident.status]} · {SEVERITY_LABEL[incident.severity]} · {detail.observations.length} reports
          </p>
        </div>
        <span className="sup-guard">Safety Guard on</span>
      </header>

      <NeedHelpBanner lang={lang} requests={helpRequests(detail, lang)} />

      {banner && (
        <div className="sup-withdraw" role="alert" aria-live="assertive">
          <p className="sup-withdraw-label">
            SAFETY RULE · SENT TO {banner.volunteerIds.length} {banner.volunteerIds.length === 1 ? 'PHONE' : 'PHONES'} · NO APPROVAL NEEDED
          </p>
          <p className="sup-withdraw-text">{banner.instruction}</p>
          <p className="sup-withdraw-meta">
            {banner.volunteerIds.map((id) => nameOf(detail, id, lang)).join(', ')}
            {banner.reasons.length > 0 && ` · ${banner.reasons.join(', ')}`}
          </p>
        </div>
      )}

      <div className="sup-grid">
        <div className="sup-col">
          <section className="sup-card" aria-label="Evidence score">
            <p className="sup-label">EVIDENCE SCORE</p>
            <p className="sup-score">{incident.evidenceScore}</p>
            <p className="sup-muted">Computed by EMBER from the reports. Not a probability.</p>
            {canVerify(incident) && (
              <div className="sup-buttons">
                <button type="button" className="btn-ink" disabled={actions.busyId === incident.id} onClick={() => actions.onVerify(incident.id)}>
                  Verify incident
                </button>
              </div>
            )}
            <OutcomeLine outcome={actions.outcomes[incident.id]} />
          </section>

          {conflict && (
            <section className={`sup-card sup-conflict status-${conflict.status}`} aria-label="Conflicting reports">
              <p className="sup-label">{conflict.status === 'open' ? 'EMBER IS NOT SURE' : 'CONFLICT RESOLVED'}</p>
              <h2>Reports disagree. Both are kept side by side.</h2>
              <div className="sup-pair">
                {pair.map((o) => <ObservationCard key={o.id} obs={o} detail={detail} lang={lang} />)}
              </div>
              <p className="sup-muted">
                Incident keeps the higher severity: {SEVERITY_LABEL[conflict.higherSeverity]}.
                {conflict.status === 'open' && ' Dispatch is held.'}
              </p>
            </section>
          )}

          {others.length > 0 && (
            <section className="sup-card" aria-label="Reports">
              <p className="sup-label">REPORTS</p>
              <div className="sup-pair">
                {others.map((o) => <ObservationCard key={o.id} obs={o} detail={detail} lang={lang} />)}
              </div>
            </section>
          )}
        </div>

        <section className="sup-card sup-col" aria-label="Tasks">
          <p className="sup-label">TASKS</p>
          {detail.tasks.length === 0 ? (
            <p className="sup-muted">No tasks yet.</p>
          ) : (
            <ul className="sup-tasks">
              {detail.tasks.map((t) => <TaskRow key={t.id} task={t} detail={detail} actions={actions} />)}
            </ul>
          )}
        </section>
      </div>
    </section>
  )
}

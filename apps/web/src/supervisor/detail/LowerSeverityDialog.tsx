import { useState } from 'react'

import { incidentLabel } from '../../pwa/incidentName'
import { t, type Lang } from '../../pwa/i18n'
import type { Incident, IncidentDecision, LowerableSeverity } from '../contracts'
import { detailCopy, severityName } from './copy'
import { Modal } from './Modal'
import { severityCopy } from './severityCopy'
import { defaultChoice, lowerChoices, submitLower } from './severityModel'

export interface LowerSeverityDialogProps {
  lang: Lang
  incident: Incident
  /** True while ember-api cannot be reached. The dialog stays, saving is blocked. */
  offline: boolean
  send(severity: LowerableSeverity): Promise<IncidentDecision>
  /** Called after the route confirmed. */
  onLowered(severity: LowerableSeverity, auditId: string): void
  /** Cancel, Escape and the backdrop. Writes nothing. */
  onClose(): void
}

/** Lower this incident's severity. Only strictly lower values are listed. */
export function LowerSeverityDialog({ lang, incident, offline, send, onLowered, onClose }: LowerSeverityDialogProps) {
  const choices = lowerChoices(incident.severity)
  const [chosen, setChosen] = useState<LowerableSeverity | null>(() => defaultChoice(incident.severity))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (chosen === null || saving || offline) return
    setSaving(true)
    setError(null)
    const result = await submitLower(send, incident.severity, chosen, lang)
    setSaving(false)
    if (result.ok) onLowered(result.severity, result.auditId)
    else setError(result.message)
  }

  const picked = chosen !== null && choices.includes(chosen) ? chosen : null
  return (
    <Modal title={`${t(lang, severityCopy.title)} ${incidentLabel(incident)}`} onClose={onClose} dismissible={!saving}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="inc-eyebrow inc-current">
          {t(lang, severityCopy.current)} · {t(lang, severityName[incident.severity])}
        </p>
        {choices.length === 0 ? (
          <p className="inc-muted">{t(lang, severityCopy.nothing)}</p>
        ) : (
          <fieldset className="inc-choices">
            <legend className="inc-sr">{t(lang, severityCopy.groupLabel)}</legend>
            {choices.map((value) => (
              <label key={value} className={value === picked ? 'inc-choice on sev' : 'inc-choice'}>
                <input
                  type="radio"
                  name="lower-severity"
                  value={value}
                  checked={value === picked}
                  disabled={saving}
                  onChange={() => setChosen(value)}
                />
                <span className="inc-pill"><i className={`inc-dot sev-${value}`} aria-hidden="true" />{t(lang, severityName[value])}</span>
                <span>{t(lang, severityCopy.option[value as keyof typeof severityCopy.option])}</span>
              </label>
            ))}
          </fieldset>
        )}
        <p className="inc-modal-note">
          {incident.severity === 'large_flame' ? t(lang, severityCopy.raiseNoteTop) : t(lang, severityCopy.raiseNote)} {t(lang, severityCopy.unknownNote)}
          {incident.withdraw?.active ? ` ${t(lang, severityCopy.withdrawNote)}` : ''}
        </p>
        {error && <p className="inc-modal-error" role="alert">{error}</p>}
        <div className="inc-modal-actions">
          <button type="button" className="inc-btn inc-btn-plain" disabled={saving} onClick={onClose}>
            {t(lang, severityCopy.cancel)}
          </button>
          <button type="submit" className="inc-btn inc-btn-ink" disabled={picked === null || saving || offline}>
            {offline
              ? t(lang, detailCopy.offlineSend)
              : saving
                ? t(lang, severityCopy.saving)
                : picked === null
                  ? t(lang, severityCopy.choose)
                  : `${t(lang, severityCopy.confirm)} ${t(lang, severityName[picked]).toLowerCase()}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}

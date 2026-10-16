import { useState } from 'react'

import { incidentLabel } from '../../pwa/incidentName'
import { t, type Lang } from '../../pwa/i18n'
import type { Incident, IncidentDecision } from '../contracts'
import { detailCopy } from './copy'
import { extinguishCopy } from './extinguishCopy'
import { submitExtinguish } from './extinguishModel'
import { Modal } from './Modal'

export interface ExtinguishDialogProps {
  lang: Lang
  incident: Incident
  /** The signed-in supervisor, named in the sentence that says who is logged. */
  actorName: string
  /** True while ember-api cannot be reached. The dialog stays, confirming is blocked. */
  offline: boolean
  send(): Promise<IncidentDecision>
  /** Called after the route confirmed. */
  onDone(auditId: string): void
  /** Called when the route said the incident is already extinguished. */
  onAlreadyOut(): void
  /** Cancel, Escape and the backdrop. Writes nothing. */
  onClose(): void
}

/** Human-only, confirmed, audited. The console cannot undo it. */
export function ExtinguishDialog({ lang, incident, actorName, offline, send, onDone, onAlreadyOut, onClose }: ExtinguishDialogProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (saving || offline) return
    setSaving(true)
    setError(null)
    const result = await submitExtinguish(send, lang)
    setSaving(false)
    if (result.ok) onDone(result.auditId)
    else if (result.alreadyOut) onAlreadyOut()
    else setError(result.message)
  }

  return (
    <Modal
      title={`${t(lang, extinguishCopy.titleBefore)} ${incidentLabel(incident)} ${t(lang, extinguishCopy.titleAfter)}`}
      onClose={onClose}
      dismissible={!saving}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="inc-modal-text">
          {t(lang, extinguishCopy.body)} {actorName || '—'} {t(lang, extinguishCopy.bodyAfter)}
        </p>
        <section className="inc-watch" aria-label={t(lang, extinguishCopy.watchTitle)}>
          <p className="inc-watch-title">{t(lang, extinguishCopy.watchTitle)}</p>
          <p className="inc-muted">{t(lang, extinguishCopy.watchBody)}</p>
        </section>
        {error && <p className="inc-modal-error" role="alert">{error}</p>}
        <div className="inc-modal-actions">
          <button type="button" className="inc-btn inc-btn-plain" disabled={saving} onClick={onClose}>
            {t(lang, extinguishCopy.cancel)}
          </button>
          <button type="submit" className="inc-btn inc-btn-ink" disabled={saving || offline}>
            {offline ? t(lang, detailCopy.offlineSend) : saving ? t(lang, extinguishCopy.saving) : t(lang, extinguishCopy.confirm)}
          </button>
        </div>
      </form>
    </Modal>
  )
}

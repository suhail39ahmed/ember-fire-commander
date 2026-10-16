import { Link } from 'react-router-dom'

import { t, type Lang } from '../../pwa/i18n'
import type { Incident } from '../contracts'
import { CONSOLE_PATHS } from '../paths'
import { canVerify } from '../view'
import { detailCopy } from './copy'
import { withdrawCopy } from './withdrawCopy'
import { severityCopy } from './severityCopy'
import { lowerChoices } from './severityModel'
import { extinguishCopy } from './extinguishCopy'

export interface ActionBarProps {
  lang: Lang
  incident: Incident
  /** True while ember-api cannot be reached. Every write is blocked, nothing is queued. */
  offline: boolean
  busy: boolean
  onVerify(incidentId: string): void
  onSendWithdraw(): void
  onLowerSeverity(): void
  onExtinguish(): void
}

/** Actions on one incident. Each opens its own dialog or page and keeps this incident open. */
export function ActionBar({ lang, incident, offline, busy, onVerify, onSendWithdraw, onLowerSeverity, onExtinguish }: ActionBarProps) {
  const blocked = offline || busy
  return (
    <div className="inc-actions" role="group" aria-label={t(lang, detailCopy.actions)}>
      {canVerify(incident) && (
        <button type="button" className="inc-btn" disabled={blocked} onClick={() => onVerify(incident.id)}>
          {offline ? t(lang, detailCopy.offlineSend) : t(lang, detailCopy.verify)}
        </button>
      )}
      {incident.status !== 'extinguished' && (
        <button type="button" className="inc-btn inc-btn-danger" disabled={blocked} onClick={onSendWithdraw}>
          {t(lang, withdrawCopy.open)}
        </button>
      )}
      {incident.status !== 'extinguished' && (
        <button type="button" className="inc-btn" disabled={blocked || lowerChoices(incident.severity).length === 0} onClick={onLowerSeverity}>
          {t(lang, severityCopy.open)}
        </button>
      )}
      {incident.status !== 'extinguished' && (
        <button type="button" className="inc-btn" disabled={blocked} onClick={onExtinguish}>
          {t(lang, extinguishCopy.open)}
        </button>
      )}
      <Link className="inc-btn inc-btn-link" to={CONSOLE_PATHS.audit}>
        {t(lang, detailCopy.auditLog)}
      </Link>
    </div>
  )
}

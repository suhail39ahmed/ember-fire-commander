import { useState } from 'react'

import { useAuth } from '../auth/AuthProvider'
import { USE_MOCK_API } from '../pwa/api/config'
import { ApiError } from '../pwa/api/types'
import { formatTime } from '../pwa/formatTime'
import { t, type Lang } from '../pwa/i18n'
import {
  dismissReignitionAlert,
  sendReignitionRecheck,
  type ReignitionAlert as AlertData,
} from './chromeClient'
import { Modal } from './detail/Modal'
import './detail/detail.css'
import { reignitionCopy } from './reignitionCopy'

const EMPTY = '—'

interface ReignitionAlertProps {
  alert: AlertData | null | undefined
  lang: Lang
  onSent(alert: AlertData): void
  onDismissed(): void
}

function relativeAgo(iso: string, lang: Lang): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return EMPTY
  const hours = Math.max(0, Math.floor((Date.now() - ms) / 3_600_000))
  if (hours < 48) {
    const unit = hours === 1 ? t(lang, reignitionCopy.hour) : t(lang, reignitionCopy.hours)
    return `${hours} ${unit} ${t(lang, reignitionCopy.ago)}`
  }
  const days = Math.floor(hours / 24)
  const unit = days === 1 ? t(lang, reignitionCopy.day) : t(lang, reignitionCopy.days)
  return `${days} ${unit} ${t(lang, reignitionCopy.ago)}`
}

function extinguishedLine(alert: AlertData, lang: Lang): string {
  const when = formatTime(alert.extinguishedAt)
  const date = (() => {
    const d = new Date(alert.extinguishedAt)
    if (Number.isNaN(d.getTime())) return EMPTY
    return d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short' })
  })()
  const code = alert.code?.trim() || EMPTY
  return `${t(lang, reignitionCopy.newLead)} ${alert.distanceM} m ${t(lang, reignitionCopy.from)} ${code}, ${t(lang, reignitionCopy.extinguished)} ${relativeAgo(alert.extinguishedAt, lang)} (${date} ${when}).`
}

/**
 * Orange re-ignition strip on the dashboard. Hidden when the API returns null.
 * Never invents a site code or a lead.
 */
export function ReignitionAlertBanner({ alert, lang, onSent, onDismissed }: ReignitionAlertProps) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissOpen, setDismissOpen] = useState(false)
  const [reason, setReason] = useState('')

  if (alert === undefined || alert === null) return null

  const code = alert.code?.trim() || EMPTY
  const sent = Boolean(alert.taskId)

  const runSend = async () => {
    setBusy(true)
    setError(null)
    try {
      if (USE_MOCK_API) {
        onSent({ ...alert, taskId: 'task_mock_recheck' })
        return
      }
      const { authHeadersFor } = await import('../pwa/api/authHeaders')
      const result = await sendReignitionRecheck(alert.incidentId, alert.id, authHeadersFor(user))
      onSent(result.alert)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t(lang, reignitionCopy.sendFailed))
    } finally {
      setBusy(false)
    }
  }

  const runDismiss = async () => {
    const trimmed = reason.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      if (!USE_MOCK_API) {
        const { authHeadersFor } = await import('../pwa/api/authHeaders')
        await dismissReignitionAlert(alert.incidentId, alert.id, trimmed, authHeadersFor(user))
      }
      setDismissOpen(false)
      setReason('')
      onDismissed()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t(lang, reignitionCopy.dismissFailed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="reignition" aria-label={t(lang, reignitionCopy.watch)}>
      <p className="reignition-kicker">{t(lang, reignitionCopy.watch)} · {code}</p>
      <p className="reignition-lead">{extinguishedLine(alert, lang)}</p>
      <p className="reignition-note">{t(lang, reignitionCopy.peatNote)}</p>
      {sent ? (
        <p className="reignition-progress" role="status">{t(lang, reignitionCopy.inProgress)}</p>
      ) : (
        <div className="reignition-actions">
          <button type="button" className="reignition-send" disabled={busy} onClick={() => { void runSend() }}>
            {t(lang, reignitionCopy.send)}
          </button>
          <button type="button" className="reignition-dismiss" disabled={busy} onClick={() => setDismissOpen(true)}>
            {t(lang, reignitionCopy.dismiss)}
          </button>
        </div>
      )}
      {error && <p className="reignition-error" role="alert">{error}</p>}
      {dismissOpen && (
        <Modal title={t(lang, reignitionCopy.dismissTitle)} onClose={() => !busy && setDismissOpen(false)} dismissible={!busy}>
          <label className="reignition-reason">
            <span>{t(lang, reignitionCopy.reasonLabel)}</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={3}
              disabled={busy}
            />
            <span className="reignition-hint">{t(lang, reignitionCopy.reasonHint)}</span>
          </label>
          <div className="reignition-actions">
            <button type="button" className="reignition-dismiss" disabled={busy} onClick={() => setDismissOpen(false)}>
              {t(lang, reignitionCopy.cancel)}
            </button>
            <button
              type="button"
              className="reignition-send"
              disabled={busy || !reason.trim()}
              onClick={() => { void runDismiss() }}
            >
              {t(lang, reignitionCopy.confirmDismiss)}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}

import { useState } from 'react'

import { formatTimeZone } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import type { Task } from '../contracts'
import { taskStatusName } from './copy'
import { deliveryCopy } from './deliveryCopy'
import { countdownText, receiptOf, submitResend, type ResendResult } from './deliveryModel'

/**
 * The line under a volunteer's last instruction: heard with the time, or not heard with the time it was
 * sent and the resend countdown, or the plain task status when no receipt exists. There is no undo.
 */
export function DeliveryLine({ lang, task, now, onResend }: { lang: Lang; task: Task; now: number; onResend?: (taskId: string) => Promise<{ auditId: string }> }) {
  const receipt = receiptOf(task, now)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ResendResult | null>(null)

  async function resend() {
    if (!onResend || busy) return
    setBusy(true)
    setResult(null)
    const outcome = await submitResend(onResend, task.id, lang)
    setBusy(false)
    setResult(outcome)
  }

  if (receipt.state === 'none') return <p className="inc-muted">{t(lang, taskStatusName[task.status])}</p>
  return (
    <>
      {receipt.state === 'heard' ? (
        <p className="inc-delivery heard">
          <span className="inc-delivery-dot" aria-hidden="true" />
          {t(lang, deliveryCopy.heard)} ✓ {formatTimeZone(receipt.heardAt)}
        </p>
      ) : (
        <p className="inc-delivery unheard">
          <span className="inc-delivery-dot" aria-hidden="true" />
          {receipt.state === 'waiting' ? t(lang, deliveryCopy.notHeard) : t(lang, deliveryCopy.notHeardAfter)} · {t(lang, deliveryCopy.sent)} {formatTimeZone(receipt.sentAt)}
          {receipt.state === 'waiting' && receipt.resendIn !== null && ` · ${t(lang, deliveryCopy.resendIn)} ${countdownText(receipt.resendIn)}`}
        </p>
      )}
      {receipt.state === 'overdue' && onResend && (
        <button type="button" className="inc-btn inc-resend" disabled={busy} onClick={() => void resend()}>
          {busy ? t(lang, deliveryCopy.resending) : t(lang, deliveryCopy.resend)}
        </button>
      )}
      {result && <p className={result.ok ? 'sup-ok' : 'inc-modal-error'} role={result.ok ? 'status' : 'alert'}>{result.text}</p>}
    </>
  )
}

import { useEffect } from 'react'

import { formatTime } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import { deliveryCopy } from './deliveryCopy'
import type { HeardEvent } from './deliveryModel'
import { volunteerLabel } from './model'

export const TOAST_MS = 8000

/** "Sari heard it · 14:23", the text, and that it is logged. There is no undo, and no control for one. */
export function HeardToast({ lang, event, name, onClose }: { lang: Lang; event: HeardEvent; /** The volunteer's name as the API gave it, else a short code. */ name?: string; onClose(): void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [event.taskId, onClose])
  return (
    <aside className="inc-toast" role="status" aria-live="polite">
      <div>
        <p className="inc-toast-title">{name?.trim() || volunteerLabel(event.volunteerId, lang)} {t(lang, deliveryCopy.toastHeard)} · {formatTime(event.heardAt)}</p>
        <p className="inc-toast-text">“{event.text}” · {t(lang, deliveryCopy.toastOn)} · {t(lang, deliveryCopy.toastLogged)}</p>
      </div>
      <p className="inc-toast-note">{t(lang, deliveryCopy.toastNoUndo)}</p>
      <button type="button" className="inc-toast-close" aria-label={t(lang, deliveryCopy.toastClose)} onClick={onClose}>×</button>
    </aside>
  )
}

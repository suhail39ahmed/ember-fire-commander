import { formatTimeZone } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import './detail.css'
import { helpCopy } from './helpCopy'
import type { HelpRequest } from './helpModel'

/**
 * A red alert for each volunteer who sent the "Need help" chip. Reply opens the instruction composer for
 * that volunteer. NOTE: needs a design review; it uses the existing danger colour and pill shapes only.
 */
export function NeedHelpBanner({ lang, requests, offline = false, onReply }: { lang: Lang; requests: HelpRequest[]; offline?: boolean; onReply?: (volunteerId: string) => void }) {
  if (requests.length === 0) return null
  return (
    <section className="inc-help" role="alert" aria-label={t(lang, helpCopy.title)}>
      <p className="inc-help-title">{t(lang, helpCopy.title)}</p>
      <ul className="inc-help-list">
        {requests.map((r) => (
          <li key={r.id} className="inc-help-item">
            <p className="inc-help-line">
              <strong>{r.name}</strong> {t(lang, helpCopy.sent)} · <time dateTime={r.at}>{formatTimeZone(r.at)}</time>
              {r.text && <span className="inc-help-text"> · “{r.text}”</span>}
            </p>
            {onReply && (
              <button type="button" className="inc-btn inc-btn-danger" disabled={offline} aria-label={`${t(lang, helpCopy.reply)} ${r.name}`} onClick={() => onReply(r.volunteerId)}>
                {t(lang, helpCopy.reply)}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

import { formatTimeZone } from '../pwa/formatTime'
import { t, type Lang } from '../pwa/i18n'
import { bannerCopy } from './bannerCopy'

/**
 * "Updated 17:07 GMT+5:30 · checks every 15 s". The time is the server's last read of the dashboard. The
 * live banner has its own updated line, so this is shown only while the banner is hidden.
 */
export function UpdatedLine({ updatedAt, lang }: { updatedAt: string | null; lang: Lang }) {
  if (!updatedAt) return null
  return (
    <p className="dash-updated">
      {t(lang, bannerCopy.updated)} <time dateTime={updatedAt}>{formatTimeZone(updatedAt)}</time> · {t(lang, bannerCopy.checks)}
    </p>
  )
}

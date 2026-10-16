import { strings, t, type Lang } from './i18n'
import type { DigestStatus } from './useDigest'

/**
 * What the volunteer sees while the digest has not loaded, or when it cannot be read. The polite region is always
 * on the page, so a screen reader announces the loading line when it appears; a failure is announced at once.
 */
export function DigestNotice({ status, hasDigest, lang, onRetry }: { status: DigestStatus; hasDigest: boolean; lang: Lang; onRetry: () => void }) {
  const failed = status === 'unreachable' || status === 'refused'
  return (
    <>
      <div aria-live="polite" className="vol-live">
        {!hasDigest && status === 'loading' && <p className="card muted">{t(lang, strings.loading)}</p>}
      </div>
      {failed && (
        <div className="card error-card" role="alert">
          <p>{t(lang, status === 'refused' ? strings.loadRefused : strings.loadError)}</p>
          <button type="button" className="btn secondary" onClick={onRetry}>
            {t(lang, strings.retry)}
          </button>
        </div>
      )}
    </>
  )
}

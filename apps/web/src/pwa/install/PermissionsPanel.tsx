import { PERM_KEYS, detectPlatform, type PermKey, type Perms, type Platform } from '../permissions/permState'
import { permHint, permStrings } from '../permissions/permStrings'
import type { Asking } from '../permissions/usePermissions'
import { strings, t, type Lang } from '../i18n'
import '../permissions/permissions.css'

const ICON_PATH: Record<PermKey, string> = {
  microphone: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  location: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  notifications: 'M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21a2 2 0 0 0 4 0',
}

function PermIcon({ perm }: { perm: PermKey }) {
  return (
    <svg className="perm-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATH[perm]} />
    </svg>
  )
}

/**
 * #19 / #16 / #76: permission states are visible BEFORE use. Every row is 72 px in every
 * state (Allow, Asking, Allowed, Blocked), so a live update never moves the layout.
 */
export function PermissionsPanel({
  perms,
  lang,
  onRequest,
  asking = {},
  platform,
  accuracyM,
}: {
  perms: Perms
  lang: Lang
  onRequest: (k: PermKey) => void
  asking?: Asking
  platform?: Platform
  accuracyM?: number | null
}) {
  const os = platform ?? detectPlatform()

  return (
    <section className="perms" aria-labelledby="perms-title">
      <div className="perms-heading"><h3 id="perms-title">
        {t(lang, permStrings.title)}
      </h3><span className="section-label">LIVE</span></div>
      <ul>
        {(['location', ...PERM_KEYS.filter((key) => key !== 'location')] as PermKey[]).map((k) => {
          const state = perms[k]
          const live = asking[k] && state !== 'granted' ? 'asking' : state
          const name = t(lang, strings[k])
          return (
            <li key={k} className={`perm perm-${live}`} data-testid={`perm-${k}`} data-state={live}>
              {live === 'prompt' && <button type="button" className="perm-row-action" aria-label={t(lang, permStrings.allowLabel(name))} onClick={() => onRequest(k)} />}
              <PermIcon perm={k} />
              <span className="perm-text">
                <span className="perm-name">{name}</span>
                <span className="perm-hint" aria-live="polite">
                  {k === 'location' && live === 'granted' && accuracyM != null && Number.isFinite(accuracyM) && accuracyM >= 0 ? `±${Math.round(accuracyM)} m` : t(lang, permHint(k, live, os))}
                </span>
              </span>
              <span className="perm-end">
                {live === 'prompt' && (
                  <span className="perm-badge">{t(lang, permStrings.notAllowed)}</span>
                )}
                {live === 'asking' && (
                  <button type="button" className="perm-btn" disabled aria-busy="true">
                    <span className="perm-spinner" aria-hidden="true" />
                    {t(lang, permStrings.asking)}
                  </button>
                )}
                {live === 'granted' && <span className="perm-badge">{t(lang, permStrings.allowed)}</span>}
                {live === 'denied' && <span className="perm-badge">{t(lang, permStrings.blocked)}</span>}
                {live === 'unsupported' && <span className="perm-badge">{t(lang, permStrings.notSupported)}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

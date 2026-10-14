import type { PermKey, Perms } from '../permissions/usePermissions'
import { strings, t, type Lang } from '../i18n'

const ORDER: PermKey[] = ['microphone', 'camera', 'location', 'notifications']

/** #19 / #16: permission states are visible BEFORE use, with a clear denied state. */
export function PermissionsPanel({ perms, lang, onRequest }: { perms: Perms; lang: Lang; onRequest: (k: PermKey) => void }) {
  return (
    <section className="card perms" aria-labelledby="perms-title">
      <h3 id="perms-title" className="section-label">
        {t(lang, strings.permissionsTitle)}
      </h3>
      <ul>
        {ORDER.map((k) => {
          const state = perms[k]
          return (
            <li key={k} className={`perm perm-${state}`} data-testid={`perm-${k}`}>
              <span className="perm-name">{t(lang, strings[k])}</span>
              <span className="perm-state">{t(lang, strings.perm[state])}</span>
              {state === 'prompt' && (
                <button type="button" className="btn small" onClick={() => onRequest(k)}>
                  {t(lang, strings.allow)}
                </button>
              )}
              {state === 'denied' && <span className="perm-help">{t(lang, strings.permDeniedHelp)}</span>}
            </li>
          )
        })}
      </ul>
      {(perms.notifications === 'denied' || perms.notifications === 'unsupported') && (
        <p className="muted">{t(lang, strings.pushUnavailable)}</p>
      )}
    </section>
  )
}

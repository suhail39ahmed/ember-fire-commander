import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { AuthShell } from './AuthShell'
import { copy, signInErrorText } from './copy'
import { type Audience } from './paths'
import { useSignIn } from './useSignIn'
import { VolunteerSignIn } from './VolunteerSignIn'

/**
 * Sign-in for one page. It renders in place at /pwa or /console, so once the
 * account is ready the same route shows the page the user opened.
 */
export function SignInScreen({ audience }: { audience: Audience }) {
  return audience === 'volunteer' ? <VolunteerSignIn /> : <SupervisorSignIn />
}

function SupervisorSignIn() {
  const { lang } = useLanguage()
  const { busy, message, onGoogle } = useSignIn()

  return (
    <AuthShell audience="supervisor">
      <div className="login-card">
        <h1>{t(lang, copy.signIn.supervisor.title)}</h1>
        <p className="sub">{t(lang, busy ? copy.signIn.opening : copy.signIn.supervisor.sub)}</p>
        <button className="google-button" type="button" onClick={onGoogle} disabled={busy} aria-busy={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          {t(lang, busy ? copy.signIn.busy : copy.signIn.button)}
        </button>
        {message ? <p className="error" role="alert">{signInErrorText(message, lang)}</p> : null}
        {busy ? (
          <p className="note waiting" role="status">
            <span className="spinner" aria-hidden="true" />
            {t(lang, copy.signIn.waiting)}
          </p>
        ) : (
          <p className="note">{t(lang, copy.signIn.note)}</p>
        )}
      </div>
    </AuthShell>
  )
}

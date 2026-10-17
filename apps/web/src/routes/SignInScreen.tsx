import { Link } from 'react-router-dom'

import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { AuthShell } from './AuthShell'
import { copy, signInErrorText } from './copy'
import { CREATE_ACCOUNT_PATH, type Audience } from './paths'
import { useSignIn } from './useSignIn'
import { SignInAlert, VolunteerAuthShell } from './VolunteerAuthShell'

/**
 * Sign-in for one page. It renders in place at /pwa or /console, so once the
 * account is ready the same route shows the page the user opened.
 */
export function SignInScreen({ audience }: { audience: Audience }) {
  return audience === 'volunteer' ? <VolunteerSignIn /> : <SupervisorSignIn />
}

/** Figma 02 Sign in: default, signing in, and pop-up blocked or cancelled. */
export function VolunteerSignIn() {
  const { lang } = useLanguage()
  const { busy, message, onGoogle } = useSignIn()

  return (
    <VolunteerAuthShell variant="welcome" footer="demo" flat={busy || Boolean(message)}>
      <h1 className="vauth-sr">{t(lang, copy.signIn.volunteer.title)}</h1>
      <p className="vauth-eyebrow">{t(lang, copy.eyebrow.volunteer)}</p>
      <p className="vauth-tagline">{t(lang, copy.volunteer.tagline)}</p>
      {message && !busy ? <SignInAlert message={message} /> : null}
      <GoogleButton busy={busy} retry={Boolean(message)} onClick={onGoogle} />
      {busy ? (
        <p className="vauth-sr" role="status">{t(lang, copy.signIn.waiting)}</p>
      ) : message ? null : (
        <>
          <div className="vauth-divider">{t(lang, copy.volunteer.newToEmber)}</div>
          <Link className="vauth-secondary" to={CREATE_ACCOUNT_PATH}>{t(lang, copy.volunteer.createAccount)}</Link>
        </>
      )}
    </VolunteerAuthShell>
  )
}

/** The dark pill used by the sign-in frame and by the session-expired frame. */
export function GoogleButton({ busy, retry = false, onClick }: { busy: boolean; retry?: boolean; onClick: () => void }) {
  const { lang } = useLanguage()
  const label = busy ? copy.signIn.busy : retry ? copy.signIn.tryAgain : copy.signIn.button
  return (
    <button className="vauth-primary" type="button" onClick={onClick} disabled={busy} aria-busy={busy}>
      {busy ? <span className="vauth-spinner" aria-hidden="true" /> : null}
      {t(lang, label)}
    </button>
  )
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

import { Link } from 'react-router-dom'

import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { copy } from './copy'
import { CREATE_ACCOUNT_PATH } from './paths'
import { useSignIn } from './useSignIn'
import { SignInAlert, VolunteerAuthShell } from './VolunteerAuthShell'

/** The PWA's sign-in page and its pending and error states. */
export function VolunteerSignIn() {
  const { lang } = useLanguage()
  const { busy, message, onGoogle } = useSignIn(true)

  return (
    <VolunteerAuthShell variant="welcome" footer="demo" flat={busy || Boolean(message)}>
      <h1 className="vauth-sr">{t(lang, copy.signIn.volunteer.title)}</h1>
      <p className="vauth-eyebrow">{t(lang, copy.eyebrow.volunteer)}</p>
      <p className="vauth-tagline">{t(lang, copy.volunteer.tagline)}</p>
      {message && !busy ? <SignInAlert message={message} /> : null}
      <GoogleButton busy={busy} retry={Boolean(message)} onClick={onGoogle} />
      {!busy && !message ? <>
        <div className="vauth-divider">{t(lang, copy.volunteer.newToEmber)}</div>
        <Link className="vauth-secondary" to={CREATE_ACCOUNT_PATH}>{t(lang, copy.volunteer.createAccount)}</Link>
      </> : null}
      {busy ? <p className="vauth-sr" role="status">{t(lang, copy.signIn.waiting)}</p> : null}
    </VolunteerAuthShell>
  )
}

/** The PWA Google button, also used for expired sessions. */
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

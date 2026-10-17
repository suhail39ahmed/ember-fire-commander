import { Link, Navigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { AuthShell } from './AuthShell'
import { copy, signInErrorText } from './copy'
import { useSignIn } from './useSignIn'
import { VolunteerWrongRole } from './VolunteerStatusScreens'

export function SupervisorCreateAccountScreen() {
  const { lang } = useLanguage()
  const { status, me, user, signOut } = useAuth()
  const { busy, message, onGoogle } = useSignIn('supervisor')
  const text = copy.supervisorSignup

  if (status === 'ready' && me) {
    return me.role === 'supervisor' ? <Navigate to="/console" replace /> : <VolunteerWrongRole me={me} />
  }

  return (
    <AuthShell audience="supervisor">
      <div className="login-card">
        <h1>{t(lang, text.title)}</h1>
        <p className="sub">{t(lang, text.body)}</p>
        {user?.email ? <p>{user.email}</p> : null}
        <button className="google-button" type="button" disabled={busy} aria-busy={busy} onClick={onGoogle}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          {t(lang, busy ? copy.signIn.busy : text.google)}
        </button>
        {message ? <p className="error" role="alert">{signInErrorText(message, lang)}</p> : null}
        {user ? <button className="text-button" type="button" disabled={busy} onClick={() => { void signOut() }}>{t(lang, text.changeAccount)}</button> : null}
        <Link className="login-back" to="/console">{t(lang, text.back)}</Link>
      </div>
    </AuthShell>
  )
}

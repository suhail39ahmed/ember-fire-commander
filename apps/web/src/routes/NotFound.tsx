import { Link, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { AuthShell } from './AuthShell'
import { copy, fill } from './copy'
import { homeFor } from './paths'

export function NotFound() {
  const { lang } = useLanguage()
  const { me } = useAuth()
  const { pathname } = useLocation()
  const supervisor = me?.role === 'supervisor'
  return (
    <AuthShell audience={supervisor ? 'supervisor' : 'volunteer'}>
      <div className="login-card">
        <h1>{t(lang, copy.notFound.title)}</h1>
        <p className="sub">{fill(t(lang, copy.notFound.body), { path: pathname })}</p>
        <p className="status-code">{t(lang, copy.notFound.code)}</p>
        <Link className="action-button" to={me ? homeFor(me.role) : '/pwa'}>
          {t(lang, supervisor ? copy.notFound.toConsole : copy.notFound.toVolunteer)}
        </Link>
        <p className="note">{t(lang, copy.signIn.note)}</p>
      </div>
    </AuthShell>
  )
}

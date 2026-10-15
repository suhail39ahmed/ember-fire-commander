import { Link, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { AuthShell } from './AuthShell'
import { copy } from './copy'
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
        <p className="sub">{t(lang, copy.notFound.body)}</p>
        <p className="status-code">404 · {pathname}</p>
        <Link className="action-button" to={me ? homeFor(me.role) : '/pwa'}>
          {t(lang, supervisor ? copy.notFound.toConsole : copy.notFound.toVolunteer)}
        </Link>
      </div>
    </AuthShell>
  )
}

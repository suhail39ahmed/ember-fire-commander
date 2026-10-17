import { Link, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { AuthShell } from './AuthShell'
import { copy, fill } from './copy'
import { homeFor } from './paths'
import { VolunteerNotFound } from './VolunteerStatusScreens'

export function NotFound() {
  const { lang } = useLanguage()
  const { me } = useAuth()
  const { pathname } = useLocation()
  const supervisor = me?.role === 'supervisor'
  if (!supervisor) {
    return <VolunteerNotFound />
  }
  return (
    <AuthShell audience="supervisor">
      <div className="login-card">
        <h1>{t(lang, copy.notFound.title)}</h1>
        <p className="sub">{fill(t(lang, copy.notFound.body), { path: pathname })}</p>
        <p className="status-code">{t(lang, copy.notFound.code)}</p>
        <Link className="action-button" to={homeFor('supervisor')}>{t(lang, copy.notFound.toConsole)}</Link>
        <p className="note">{t(lang, copy.signIn.note)}</p>
      </div>
    </AuthShell>
  )
}

import { Link, Navigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { AuthShell } from './AuthShell'
import { copy } from './copy'
import { homeFor } from './paths'
import { CheckingScreen } from './RoleHome'

const CHOICES = [
  { audience: 'volunteer', to: '/pwa' },
  { audience: 'supervisor', to: '/console' },
] as const

/** The page at `/`: signed-in users go to their own page, everyone else picks a role. */
export function RoleChoice() {
  const { lang } = useLanguage()
  const { status, me } = useAuth()

  if (status === 'loading') {
    return <CheckingScreen />
  }
  if (status === 'ready' && me) {
    return <Navigate to={homeFor(me.role)} replace />
  }

  return (
    <AuthShell audience="general">
      <div className="login-card">
        <h1>{t(lang, copy.roleChoice.title)}</h1>
        <p className="sub">{t(lang, copy.roleChoice.sub)}</p>
        <nav className="role-choices" aria-label={t(lang, copy.roleChoice.title)}>
          {CHOICES.map(({ audience, to }) => (
            <Link key={to} className="role-card" to={to}>
              <span className="role-card-title">{t(lang, copy.roleChoice[audience].title)}</span>
              <span className="role-card-desc">{t(lang, copy.roleChoice[audience].desc)}</span>
              <span className="role-card-path">{to.toUpperCase()}</span>
            </Link>
          ))}
        </nav>
      </div>
    </AuthShell>
  )
}

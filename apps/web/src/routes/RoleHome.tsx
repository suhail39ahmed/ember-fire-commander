import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

import { useAuth } from '../auth/AuthProvider'
import type { Me } from '../auth/api'
import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { AuthShell } from './AuthShell'
import { copy } from './copy'
import { homeFor } from './paths'
import { SignInScreen } from './SignInScreen'
import './login.css'

export function CheckingScreen() {
  const { lang } = useLanguage()
  return <main className="role-screen checking" role="status">
      <p><span className="spinner" aria-hidden="true" />{t(lang, copy.checking)}</p>
    </main>
}

/**
 * Gate for a role's page. Signed out, it shows that role's sign-in on the same
 * URL, so signing in returns the user to the page they opened.
 */
export function RequireRole({ role, children }: { role: Me['role']; children: ReactNode }) {
  const { lang } = useLanguage()
  const { status, me, message, signOut } = useAuth()
  if (status === 'loading') {
    return <CheckingScreen />
  }
  if (status === 'signed-out') {
    return <SignInScreen audience={role} />
  }
  if (status === 'no-access' || !me) {
    return (
      <AuthShell audience={role}>
        <div className="login-card">
          <h1>{t(lang, copy.noAccess.title)}</h1>
          <p className="error" role="alert">{message || t(lang, copy.noAccess.fallback)}</p>
          <button className="action-button" type="button" onClick={() => { void signOut() }}>{t(lang, copy.signOut)}</button>
        </div>
      </AuthShell>
    )
  }
  if (me.role !== role) {
    const text = role === 'supervisor' ? copy.wrongRole.volunteerOnSupervisorPage : copy.wrongRole.supervisorOnVolunteerPage
    return (
      <AuthShell audience={role}>
        <div className="login-card">
          <h1>{t(lang, text.title)}</h1>
          <p className="sub">{t(lang, text.body)}</p>
          <p className="status-code">{t(lang, copy.wrongRole.code)} · {homeFor(role).toUpperCase()}</p>
          <Link className="action-button" to={homeFor(me.role)}>{t(lang, text.action)}</Link>
          <button className="text-button" type="button" onClick={() => { void signOut() }}>{t(lang, copy.signOut)}</button>
        </div>
      </AuthShell>
    )
  }
  return children
}

export function RoleHome({ title }: { title: string }) {
  const { me, signOut } = useAuth()
  if (!me) {
    return null
  }
  return (
    <main className="role-screen">
      <p className="eyebrow">EMBER</p>
      <h1>{title}</h1>
      <section className="me-card" aria-label="Signed-in user">
        <p><strong>User:</strong> {me.displayName || '—'}</p>
        <p><strong>Role:</strong> {me.role}</p>
        <p><strong>ID:</strong> {me.id}</p>
      </section>
      <button className="sign-out" type="button" onClick={() => { void signOut() }}>Sign out</button>
    </main>
  )
}

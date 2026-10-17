import type { ReactNode } from 'react'

import { useAuth } from '../auth/AuthProvider'
import type { Me } from '../auth/api'
import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { AuthShell } from './AuthShell'
import { copy, fill } from './copy'
import { SignInScreen } from './SignInScreen'
import {
  VolunteerAccountCheckFailed,
  VolunteerDeviceNotVerified,
  VolunteerNoAccess,
  VolunteerSessionExpired,
  VolunteerWrongRole,
} from './VolunteerStatusScreens'
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
  const { status, me, user, signOut, refreshMe } = useAuth()
  const email = user?.email || '—'
  const volunteer = role === 'volunteer'

  // The volunteer's sign-in frame doubles as the "Signing in..." frame while /me is being checked.
  if (status === 'loading') {
    return volunteer ? <SignInScreen audience="volunteer" /> : <CheckingScreen />
  }
  if (status === 'signed-out') {
    return <SignInScreen audience={role} />
  }
  if (status === 'session-expired') {
    return volunteer ? <VolunteerSessionExpired /> : <SignInScreen audience={role} />
  }
  if (status === 'device-unverified') {
    return volunteer ? <VolunteerDeviceNotVerified /> : <DeviceNotVerifiedCard />
  }
  if (volunteer && status === 'error') {
    return <VolunteerAccountCheckFailed />
  }
  if (volunteer && (status === 'no-access' || !me)) {
    return <VolunteerNoAccess />
  }
  if (status === 'no-access' || !me) {
    return (
      <AuthShell audience={role}>
        <div className="login-card">
          <h1>{t(lang, copy.noAccess.title)}</h1>
          <p className="sub">{fill(t(lang, copy.noAccess[role]), { email })}</p>
          <p className="status-code">{t(lang, copy.noAccess.code)}</p>
          <button className="action-button" type="button" onClick={() => { void refreshMe() }}>
            {t(lang, copy.noAccess.checkAgain)}
          </button>
          <button className="text-button" type="button" onClick={() => { void signOut() }}>{t(lang, copy.signOut)}</button>
          <p className="note">{t(lang, copy.signIn.note)}</p>
        </div>
      </AuthShell>
    )
  }
  if (me.role !== role) {
    return <VolunteerWrongRole me={me} />
  }
  return children
}

/** The console's version of the device-not-verified screen: same words, the supervisor's card. */
function DeviceNotVerifiedCard() {
  const { lang } = useLanguage()
  const { signOut } = useAuth()
  const text = copy.volunteer.deviceNotVerified
  return (
    <AuthShell audience="supervisor">
      <div className="login-card">
        <h1>{t(lang, text.title)}</h1>
        <p className="sub">{t(lang, text.body)}</p>
        <p className="status-code">{t(lang, text.code)}</p>
        <button className="action-button" type="button" onClick={() => window.location.reload()}>{t(lang, text.action)}</button>
        <button className="text-button" type="button" onClick={() => { void signOut() }}>{t(lang, copy.signOut)}</button>
      </div>
    </AuthShell>
  )
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

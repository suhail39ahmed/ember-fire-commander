import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import type { Me } from '../auth/api'
import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { copy, fill } from './copy'
import { homeFor } from './paths'
import { GoogleButton } from './SignInScreen'
import { SignInAlert, StatusCard, VolunteerAuthShell } from './VolunteerAuthShell'
import { useSignIn } from './useSignIn'

function SignOutButton() {
  const { lang } = useLanguage()
  const { signOut } = useAuth()
  return <button className="vauth-text" type="button" onClick={() => { void signOut() }}>{t(lang, copy.signOut)}</button>
}

/** Runs `/me` again from a button and shows the wait on that button. */
function useCheckAgain() {
  const { refreshMe } = useAuth()
  const [checking, setChecking] = useState(false)
  async function check() {
    setChecking(true)
    try {
      await refreshMe({ quiet: true })
    } finally {
      setChecking(false)
    }
  }
  return { checking, check }
}

function CheckButton({ label, checking, onClick }: { label: string; checking: boolean; onClick: () => void }) {
  return (
    <button className="vauth-primary" type="button" onClick={onClick} disabled={checking} aria-busy={checking}>
      {checking ? <span className="vauth-spinner" aria-hidden="true" /> : null}
      {label}
    </button>
  )
}

/** 403 role_missing: signed in with Google, but no role yet. */
export function VolunteerNoAccess() {
  const { lang } = useLanguage()
  const { user } = useAuth()
  const { checking, check } = useCheckAgain()
  const email = user?.email || '—'
  return (
    <VolunteerAuthShell variant="status">
      <StatusCard
        icon="person"
        tone="amber"
        title={t(lang, copy.noAccess.title)}
        body={fill(t(lang, copy.noAccess.volunteer), { email })}
        code={t(lang, copy.noAccess.code)}
      >
        <CheckButton label={t(lang, copy.noAccess.checkAgain)} checking={checking} onClick={() => { void check() }} />
        <SignOutButton />
      </StatusCard>
    </VolunteerAuthShell>
  )
}

/** The account loaded for some other reason (no network, ember-api down). Plain words, one way forward. */
export function VolunteerAccountCheckFailed() {
  const { lang } = useLanguage()
  const { checking, check } = useCheckAgain()
  return (
    <VolunteerAuthShell variant="status">
      <StatusCard
        icon="bell"
        tone="amber"
        title={t(lang, copy.volunteer.accountCheckFailed.title)}
        body={t(lang, copy.volunteer.accountCheckFailed.body)}
      >
        <CheckButton label={t(lang, copy.signIn.tryAgain)} checking={checking} onClick={() => { void check() }} />
        <SignOutButton />
      </StatusCard>
    </VolunteerAuthShell>
  )
}

/** A volunteer on /console, or a supervisor on /pwa. Names the other app and links to it. */
export function VolunteerWrongRole({ me }: { me: Me }) {
  const { lang } = useLanguage()
  const { pathname } = useLocation()
  const text = me.role === 'volunteer' ? copy.wrongRole.volunteerOnSupervisorPage : copy.wrongRole.supervisorOnVolunteerPage
  return (
    <VolunteerAuthShell variant="status" footer="label">
      <StatusCard
        icon="map"
        tone="amber"
        title={t(lang, text.title)}
        body={t(lang, text.body)}
        code={`${t(lang, copy.wrongRole.code)} · ${pathname}`}
      >
        <Link className="vauth-primary" to={homeFor(me.role)}>{t(lang, text.action)}</Link>
        <SignOutButton />
      </StatusCard>
    </VolunteerAuthShell>
  )
}

/** App Check rejected this device. Nothing is sent; the outbox stays on the phone. */
export function VolunteerDeviceNotVerified() {
  const { lang } = useLanguage()
  const text = copy.volunteer.deviceNotVerified
  return (
    <VolunteerAuthShell variant="status">
      <StatusCard icon="bell" tone="red" title={t(lang, text.title)} body={t(lang, text.body)} code={t(lang, text.code)}>
        <button className="vauth-primary" type="button" onClick={() => window.location.reload()}>{t(lang, text.action)}</button>
        <SignOutButton />
      </StatusCard>
    </VolunteerAuthShell>
  )
}

/** The ID token expired (401). Queued reports stay on the phone and send after the next sign-in. */
export function VolunteerSessionExpired() {
  const { lang } = useLanguage()
  const { busy, message, onGoogle } = useSignIn()
  const text = copy.volunteer.sessionExpired
  return (
    <VolunteerAuthShell variant="status">
      <StatusCard icon="person" tone="muted" title={t(lang, text.title)} body={t(lang, text.body)} code={t(lang, text.code)}>
        {message && !busy ? <SignInAlert message={message} /> : null}
        <GoogleButton busy={busy} retry={Boolean(message)} onClick={onGoogle} />
      </StatusCard>
    </VolunteerAuthShell>
  )
}

/** An unknown path. Only the path is dynamic. */
export function VolunteerNotFound() {
  const { lang } = useLanguage()
  const { pathname } = useLocation()
  return (
    <VolunteerAuthShell variant="status">
      <StatusCard
        icon="back"
        tone="muted"
        title={t(lang, copy.notFound.title)}
        body={t(lang, copy.volunteer.notFoundBody)}
        code={`404 · ${pathname}`}
      >
        <Link className="vauth-primary" to="/pwa">{t(lang, copy.notFound.toVolunteer)}</Link>
      </StatusCard>
    </VolunteerAuthShell>
  )
}

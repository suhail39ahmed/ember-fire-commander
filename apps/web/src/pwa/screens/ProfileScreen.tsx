import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../../auth/AuthProvider'
import { LanguageDropdown, ThemeSwitch } from '../DisplayControls'
import { PermissionsPanel } from '../install/PermissionsPanel'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { t } from '../i18n'
import { screenStrings } from './strings'
import { ProfileConnectivity } from './ProfileConnectivity'
import './profile.css'

export function ProfileScreen() {
  const { lang } = useLanguage()
  const { signOut } = useAuth()
  const { me, perms, asking, requestPermission, position, updateMe, settingsSaving, settingsError } = useVolunteer()
  const [failed, setFailed] = useState(false)
  const copy = screenStrings.profile
  const initials = (me?.displayName ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => Array.from(word)[0]).join('').toLocaleUpperCase()
  const crew = [me?.crewName?.trim(), me?.roleLabel?.trim()].filter(Boolean).join(' · ')

  return (
    <div className="profile-screen">
      <h1 className="profile-title">{t(lang, copy.title)}</h1>
      <section className="card profile-card" aria-labelledby="profile-name">
        <div className="profile-identity">
          {initials && <span className="profile-avatar" aria-hidden="true">{initials}</span>}
          <div><h2 id="profile-name">{me?.displayName || 'EMBER'}</h2>
            {crew && <p className="muted small" data-testid="profile-crew">{crew}</p>}
          </div>
        </div>
        <dl className="profile-details">
          {me?.supervisorName && <div><dt>{t(lang, copy.supervisor)}</dt><dd>{me.supervisorName}</dd></div>}
          {me?.phoneMasked && <div><dt>{t(lang, copy.phone)}</dt><dd>{me.phoneMasked}</dd></div>}
          {me?.trainingDone != null && me?.trainingTotal != null && <div><dt>{t(lang, copy.training)}</dt><dd><Link to="/pwa/guide">{t(lang, copy.trainingProgress(me.trainingDone, me.trainingTotal))}</Link></dd></div>}
        </dl>
      </section>
      <section className="card profile-setting">
        <div><h3>{t(lang, copy.language)}</h3><p className="muted small">{t(lang, copy.languageNote)}</p></div>
        <LanguageDropdown />
      </section>
      <section className="card profile-setting">
        <div><h3>{t(lang, copy.appearance)}</h3><p className="muted small">{t(lang, copy.appearanceNote)}</p></div>
        <ThemeSwitch />
      </section>
      <section className="card profile-setting">
        <div><h3 id="profile-share-label">{t(lang, copy.share)}</h3><p className="muted small">{t(lang, copy.shareNote)}</p></div>
        <button type="button" role="switch" className="profile-switch" aria-labelledby="profile-share-label" aria-checked={me?.shareMyLocationWithCrew ?? true} disabled={settingsSaving} onClick={() => updateMe({ shareMyLocationWithCrew: !(me?.shareMyLocationWithCrew ?? true) })}><span /></button>
      </section>
      {settingsError && <p className="error" role="alert">{t(lang, copy.saveFailed)}</p>}
      <PermissionsPanel perms={perms} asking={asking} lang={lang} onRequest={requestPermission} accuracyM={position.kind === 'ok' ? position.accuracyM : null} />
      <ProfileConnectivity lang={lang} />
      <button type="button" className="btn secondary profile-signout" onClick={() => { setFailed(false); signOut().catch(() => setFailed(true)) }}>{t(lang, copy.signOut)}</button>
      {failed && <p className="error" role="alert">{t(lang, copy.signOutFailed)}</p>}
      {me?.demoMode === true && <p className="profile-demo">{t(lang, copy.demo)}</p>}
    </div>
  )
}

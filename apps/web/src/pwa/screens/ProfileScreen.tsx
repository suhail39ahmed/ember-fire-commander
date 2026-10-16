import { useState } from 'react'

import { useAuth } from '../../auth/AuthProvider'
import { ThemeSwitch } from '../DisplayControls'
import { LanguageToggle } from '../LanguageProvider'
import { PermissionsPanel } from '../install/PermissionsPanel'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { t } from '../i18n'
import { screenStrings } from './strings'

/** The Profile tab (#152): name and crew, language, appearance, permission rows and sign out. */
export function ProfileScreen() {
  const { lang } = useLanguage()
  const { signOut } = useAuth()
  const { me, perms, asking, requestPermission } = useVolunteer()
  const [failed, setFailed] = useState(false)
  const crew = me?.crewName?.trim()

  return (
    <>
      <section className="card" aria-labelledby="profile-name">
        <h2 id="profile-name">{me?.displayName || 'EMBER'}</h2>
        <p className="section-label">{t(lang, screenStrings.profile.crew)}</p>
        <p data-testid="profile-crew">{crew || t(lang, screenStrings.profile.crewUnknown)}</p>
      </section>

      <section className="card">
        <p className="section-label">{t(lang, screenStrings.profile.language)}</p>
        <LanguageToggle />
        <p className="section-label">{t(lang, screenStrings.profile.appearance)}</p>
        <ThemeSwitch />
        <p className="muted small">{t(lang, screenStrings.profile.appearanceNote)}</p>
      </section>

      <PermissionsPanel perms={perms} asking={asking} lang={lang} onRequest={requestPermission} />

      <button
        type="button"
        className="btn secondary"
        onClick={() => {
          setFailed(false)
          signOut().catch(() => setFailed(true))
        }}
      >
        {t(lang, screenStrings.profile.signOut)}
      </button>
      {failed && <p className="error" role="alert">{t(lang, screenStrings.profile.signOutFailed)}</p>}
    </>
  )
}

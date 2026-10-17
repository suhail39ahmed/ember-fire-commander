import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { LanguageDropdown } from '../pwa/DisplayControls'
import { Shield } from './VolunteerAuthShell'
import heroUrl from './assets/role-choice-hero.png'
import './roleChoice.css'
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
  const [remembered, setRemembered] = useState<string | null>(null)
  useEffect(() => {
    try { setRemembered(localStorage.getItem('ember.role-choice')) } catch { /* Storage may be unavailable. */ }
  }, [])

  if (status === 'loading') {
    return <CheckingScreen />
  }
  if (status === 'ready' && me) {
    return <Navigate to={homeFor(me.role)} replace />
  }
  if (status === 'signed-out' && (remembered === 'volunteer' || remembered === 'supervisor')) {
    return <Navigate to={homeFor(remembered)} replace />
  }

  return (
    <main className="pwa-role-choice">
      <img className="pwa-role-photo" src={heroUrl} alt="" />
      <div className="pwa-role-shade" aria-hidden="true" />
      <div className="pwa-role-brand"><Shield size={28} /><span>EMBER</span></div>
      <div className="pwa-role-content">
        <h1>{t(lang, copy.roleChoice.title)}</h1>
        <p>{t(lang, copy.roleChoice.sub)}</p>
        <nav className="pwa-role-cards" aria-label={t(lang, copy.roleChoice.title)}>
          {CHOICES.map(({ audience, to }) => (
            <Link key={to} className="pwa-role-card" to={to} onClick={() => {
              try { localStorage.setItem('ember.role-choice', audience) } catch { /* Navigation still works without storage. */ }
            }}>
              <span className="pwa-role-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
                {audience === 'volunteer' ? <path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5M8 12h8" /> : <path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2V5Zm6-2v15m6-12v15" />}
              </svg></span>
              <span className="pwa-role-copy">
                <strong>{t(lang, copy.roleChoice[audience].title)}</strong>
                <span>{t(lang, copy.roleChoice[audience].desc)}</span>
                <small>{audience === 'volunteer' ? 'FIELD' : 'BPBD'}</small>
              </span>
            </Link>
          ))}
        </nav>
        <div className="pwa-role-footer"><span>{t(lang, copy.roleChoice.language)}</span><LanguageDropdown placement="up" /></div>
      </div>
    </main>
  )
}

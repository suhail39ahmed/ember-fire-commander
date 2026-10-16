import { useEffect, useState, type ReactNode } from 'react'

import { fetchConfig } from '../auth/config'
import { t } from '../pwa/i18n'
import { LanguageToggle } from '../pwa/LanguageProvider'
import { useLanguage } from '../pwa/language'
import { copy } from './copy'
import './login.css'
import './loginDark.css'

function Shield() {
  return (
    <svg className="lockup-mark" width="48" height="48" viewBox="0 0 52 52" aria-hidden="true">
      <path d="M25.6 3.6L42.4 9.44V23.6C42.4 34.56 35.44 42.88 25.6 47.6C15.76 42.88 8.8 34.56 8.8 23.6V9.44L25.6 3.6Z" fill="#E2531B" />
      <path d="M26.08 12.4C28.32 17.28 33.76 20.32 33.12 27.68C32.64 33.2 29.44 36.48 25.6 36.48C21.6 36.48 18.24 33.44 18.24 28.8C18.24 24.96 20.48 22.88 21.92 20.16C22.88 22.72 24.32 24 25.28 24.32C26.88 21.12 27.2 16.8 26.08 12.4Z" fill="#fff" />
    </svg>
  )
}

/** Two-pane frame for every signed-out screen: brand on one side, the card on the other. */
export function AuthShell({ audience, children }: { audience: 'volunteer' | 'supervisor' | 'general'; children: ReactNode }) {
  const { lang } = useLanguage()
  const [demoMode, setDemoMode] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchConfig().then((config) => {
      if (!cancelled) setDemoMode(config.demoMode)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <main className="login-screen">
      <section className="login-brand">
        <div className="login-brand-main">
          <div className="lockup"><Shield /> EMBER</div>
          <p className="eyebrow">{t(lang, copy.eyebrow[audience])}</p>
          <p className="tagline">{t(lang, copy.tagline[audience])}</p>
        </div>
        {demoMode ? <p className="footnote">{t(lang, copy.footnote)}</p> : null}
      </section>
      <section className="login-panel">
        <div className="login-lang"><LanguageToggle /></div>
        {children}
      </section>
    </main>
  )
}

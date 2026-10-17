import { useEffect, useState, type ReactNode } from 'react'

import { fetchConfig } from '../auth/config'
import { t } from '../pwa/i18n'
import { LanguageDropdown } from '../pwa/DisplayControls'
import { useLanguage } from '../pwa/language'
import heroUrl from './assets/sign-in-hero.png'
import { copy, volunteerSignInError } from './copy'
import './volunteerAuth.css'

export function Shield({ size }: { size: number }) {
  return (
    <svg className="vauth-mark" width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {/* The brand emblem, as in public/brand/ember-emblem.svg. */}
      <path d="M32 4.5L53 11.8V29.5C53 43.2 44.3 53.6 32 59.5C19.7 53.6 11 43.2 11 29.5V11.8L32 4.5Z" stroke="#E2531B" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M32.6 15.5C35.4 21.6 42.2 25.4 41.4 34.6C40.8 41.5 36.8 45.6 32 45.6C27 45.6 22.8 41.8 22.8 36C22.8 31.2 25.6 28.6 27.4 25.2C28.6 28.4 30.4 30 31.6 30.4C33.6 26.4 34 21 32.6 15.5Z" fill="#E2531B" />
      <path d="M32 42C33.8778 42 35.4 40.4777 35.4 38.5999C35.4 36.7222 33.8778 35.2 32 35.2C30.1222 35.2 28.6 36.7222 28.6 38.5999C28.6 40.4777 30.1222 42 32 42Z" fill="#FAF7F2" />
    </svg>
  )
}

/** What the footer row carries: the simulated-demo strip, a language label, or only the toggle. */
export type ShellFooter = 'demo' | 'label' | 'toggle'

/**
 * Full-bleed phone frame for the volunteer's signed-out screens (Figma 02 Sign in and its states).
 * `welcome` puts the EMBER lockup in the text stack; `status` pins a small lockup to the top.
 */
export function VolunteerAuthShell({
  variant,
  footer,
  flat = false,
  children,
}: {
  variant: 'welcome' | 'status'
  footer?: ShellFooter
  /** Figma draws the signing-in and error frames under a flat dark overlay; the idle sign-in has a gradient. */
  flat?: boolean
  children: ReactNode
}) {
  const { lang } = useLanguage()
  const [demoMode, setDemoMode] = useState(false)

  useEffect(() => {
    if (footer !== 'demo') return undefined
    let cancelled = false
    void fetchConfig().then((config) => {
      if (!cancelled) setDemoMode(config.demoMode)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [footer])

  return (
    <main className={`vauth vauth-${variant}${flat || variant === 'status' ? ' vauth-flat' : ''}`}>
      <img className="vauth-photo" src={heroUrl} alt="" />
      <div className="vauth-shade" aria-hidden="true" />
      {variant === 'status' ? (
        <div className="vauth-top">
          <Shield size={28} />
          <span className="vauth-wordmark">EMBER</span>
        </div>
      ) : null}
      <div className="vauth-stack">
        {variant === 'welcome' ? (
          <div className="vauth-lockup">
            <Shield size={48} />
            <span className="vauth-wordmark">EMBER</span>
          </div>
        ) : null}
        {children}
        {footer ? (
          <div className="vauth-footer">
            {footer === 'demo' && demoMode ? <span className="vauth-meta">{t(lang, copy.volunteer.demo)}</span> : null}
            {footer === 'label' ? <span className="vauth-label">{t(lang, copy.volunteer.languageLabel)}</span> : null}
            <LanguageDropdown placement="up" />
          </div>
        ) : null}
      </div>
    </main>
  )
}

/** The red card for a sign-in that did not finish. It maps the Firebase error to plain words. */
export function SignInAlert({ message }: { message: string }) {
  const { lang } = useLanguage()
  const { title, body } = volunteerSignInError(message, lang)
  return (
    <div className="vauth-alert" role="alert">
      <span className="vauth-alert-dot" aria-hidden="true" />
      <p className="vauth-alert-title">{title}</p>
      <p className="vauth-alert-body">{body}</p>
    </div>
  )
}

export type StatusIconName = 'person' | 'map' | 'bell' | 'back'
export type StatusTone = 'amber' | 'red' | 'muted'

function StatusIcon({ name }: { name: StatusIconName }) {
  const common = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const
  switch (name) {
    case 'person':
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" /></svg>
    case 'map':
      return <svg {...common}><path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z" /><path d="M9 4v13.5M15 6.5V20" /></svg>
    case 'bell':
      return <svg {...common}><path d="M6 16.5V11a6 6 0 1112 0v5.5l1.5 1.5h-15z" /><path d="M10 21h4" /></svg>
    case 'back':
      return <svg {...common}><path d="M15 5l-7 7 7 7" /></svg>
  }
}

/** Icon, title, body and a mono code line, as the error frames lay them out. */
export function StatusCard({
  icon,
  tone,
  title,
  body,
  code,
  children,
}: {
  icon: StatusIconName
  tone: StatusTone
  title: string
  body: string
  code?: string
  children: ReactNode
}) {
  return (
    <>
      <div className={`vauth-icon vauth-icon-${tone}`}><StatusIcon name={icon} /></div>
      <h1 className="vauth-title">{title}</h1>
      <p className="vauth-body">{body}</p>
      {code ? <p className="vauth-code">{code}</p> : null}
      <div className="vauth-actions">{children}</div>
    </>
  )
}

import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { USE_MOCK_API } from '../pwa/api/config'
import { formatTimeZone } from '../pwa/formatTime'
import { strings, t } from '../pwa/i18n'
import { DisplayControls } from '../pwa/DisplayControls'
import { copy } from '../routes/copy'
import { chromeCopy } from './chromeCopy'
import { ConsoleProvider, useConsole, type ChromeFailure } from './ConsoleProvider'
import type { ConsoleChrome } from './chromeClient'
import type { ConsoleMenu } from './paths'
import { CONSOLE_PATHS } from './paths'
import './supervisor.css'
import './themeDark.css'

function EmberMark() {
  return (
    <svg className="console-mark" width="28" height="28" viewBox="0 0 52 52" aria-hidden="true">
      <path d="M25.6 3.6L42.4 9.44V23.6C42.4 34.56 35.44 42.88 25.6 47.6C15.76 42.88 8.8 34.56 8.8 23.6V9.44L25.6 3.6Z" stroke="#E2531B" strokeWidth="2.56" strokeLinejoin="round" fill="none" />
      <path d="M26.08 12.4C28.32 17.28 33.76 20.32 33.12 27.68C32.64 33.2 29.44 36.48 25.6 36.48C21.6 36.48 18.24 33.44 18.24 28.8C18.24 24.96 20.48 22.88 21.92 20.16C22.88 22.72 24.32 24 25.28 24.32C26.88 21.12 27.2 16.8 26.08 12.4Z" fill="#E2531B" />
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19.2c1.4-3 3.8-4.4 7-4.4s5.6 1.4 7 4.4" strokeLinecap="round" />
    </svg>
  )
}

const MENU: { id: ConsoleMenu; to: string }[] = [
  { id: 'incidents', to: CONSOLE_PATHS.incidents },
  { id: 'approvals', to: CONSOLE_PATHS.approvals },
  { id: 'map', to: CONSOLE_PATHS.map },
  { id: 'audit', to: CONSOLE_PATHS.audit },
]

function menuLabel(id: ConsoleMenu, language: ReturnType<typeof useConsole>['language'], count: number | null): string {
  const name = t(language, chromeCopy[id])
  if (id !== 'approvals' || count === null) return name
  return `${name} · ${count}`
}

function ServerClock({ serverTime, skewMs, label }: { serverTime: string | null; skewMs: number | null; label: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const text = serverTime && skewMs !== null ? formatTimeZone(now + skewMs) : '--:--'
  return (
    <time dateTime={serverTime ?? undefined} className="console-clock" aria-label={`${label} ${text}`}>
      {text}
    </time>
  )
}

function ConsoleFrame({ fallback }: { fallback: ReactNode }) {
  const { signOut } = useAuth()
  const ctx = useConsole()
  const { language, activeMenu, approvalsCount, agency, serverTime, clockSkewMs, chromeError, supervisor } = ctx
  const who = supervisor.displayName || '—'
  return (
    <div className="console">
      <header className="console-top">
        <p className="console-brand"><EmberMark /> EMBER</p>
        <p className="console-title">{t(language, chromeCopy.title)}</p>
        <p className="console-who">
          {who}
          {agency ? ` · ${agency}` : ''}
        </p>
        {USE_MOCK_API && <p className="console-note">{t(language, strings.simulated)}</p>}
        <span className="console-spacer" />
        {chromeError && <p className="console-alert" role="alert">{chromeError}</p>}
        <ServerClock serverTime={serverTime} skewMs={clockSkewMs} label={t(language, chromeCopy.serverTime)} />
        <DisplayControls />
        <div className="console-session">
          <p className="console-duty" role="status">{t(language, chromeCopy.onDuty)}</p>
          <details className="console-account">
            <summary aria-label={t(language, chromeCopy.account)}><ProfileIcon /></summary>
            <div className="console-account-menu">
              <button type="button" className="console-signout" onClick={() => { void signOut() }}>
                {t(language, copy.signOut)}
              </button>
            </div>
          </details>
        </div>
      </header>
      <nav className="console-menu" aria-label={t(language, chromeCopy.menu)}>
        {MENU.map((item) => {
          const active = item.id === activeMenu
          return (
            <Link
              key={item.id}
              to={item.to}
              className={active ? 'console-nav active' : 'console-nav'}
              aria-current={active ? 'page' : undefined}
            >
              {menuLabel(item.id, language, approvalsCount)}
            </Link>
          )
        })}
      </nav>
      <main className="console-main">
        <Suspense fallback={fallback}>{<Outlet />}</Suspense>
      </main>
    </div>
  )
}

function ContentFallback() {
  const { language } = useConsole()
  return <p className="console-loading" role="status">{t(language, chromeCopy.loading)}</p>
}

/** Left menu and top bar for every signed-in supervisor page. The outlet is the only region that changes. */
export function ConsoleLayout({ chrome, chromeError }: { chrome?: ConsoleChrome; chromeError?: ChromeFailure }) {
  return (
    <ConsoleProvider chrome={chrome} chromeError={chromeError}>
      <ConsoleFrame fallback={<ContentFallback />} />
    </ConsoleProvider>
  )
}

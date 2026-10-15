import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { USE_MOCK_API } from '../pwa/api/config'
import { ApiError } from '../pwa/api/types'
import { t, type Lang } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { fetchConsoleChrome, mockConsoleChrome, type ConsoleChrome } from './chromeClient'
import { chromeCopy } from './chromeCopy'
import { consoleMenu, type ConsoleMenu } from './paths'

/** The dashboard frame checks every 15 s. This read follows that, separate from the incident poll. */
const CHROME_POLL_MS = 15000

export type ChromeFailure = 'network' | 'failed'

export interface ConsoleContextValue {
  supervisor: { id: string; displayName: string; role: 'supervisor' }
  language: Lang
  activeMenu: ConsoleMenu
  approvalsCount: number | null
  serverTime: string | null
  /** Add to Date.now() for the server clock from the last successful read. */
  clockSkewMs: number | null
  agency: string | null
  chromeError: string | null
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null)

function skewOf(serverTime: string | null | undefined): number | null {
  if (!serverTime) return null
  const serverMs = Date.parse(serverTime)
  if (Number.isNaN(serverMs)) return null
  return serverMs - Date.now()
}

/**
 * One provider for the signed-in console. It holds the supervisor, the browser
 * language, the active menu item, and the chrome read. It does not hold
 * incident lists, incident detail, or dialog state.
 */
export function ConsoleProvider({
  children,
  chrome,
  chromeError: chromeErrorOverride,
}: {
  children: ReactNode
  /** Skip the network read. Tests and previews pass the payload directly. */
  chrome?: ConsoleChrome
  chromeError?: ChromeFailure
}) {
  const { user, me } = useAuth()
  const { lang } = useLanguage()
  const { pathname } = useLocation()
  const injected = chrome !== undefined || chromeErrorOverride !== undefined
  const [picture, setPicture] = useState<ConsoleChrome | null>(chrome ?? null)
  const [clockSkewMs, setClockSkewMs] = useState<number | null>(() => skewOf(chrome?.serverTime))
  const [failure, setFailure] = useState<ChromeFailure | null>(chromeErrorOverride ?? null)

  useEffect(() => {
    if (injected) return
    let cancelled = false
    const load = async () => {
      try {
        let next: ConsoleChrome
        if (USE_MOCK_API) {
          next = mockConsoleChrome()
        } else {
          const { authHeadersFor } = await import('../pwa/api/authHeaders')
          next = await fetchConsoleChrome(authHeadersFor(user))
        }
        if (cancelled) return
        setPicture(next)
        setClockSkewMs(skewOf(next.serverTime))
        setFailure(null)
      } catch (err) {
        if (cancelled) return
        setFailure(err instanceof ApiError && err.code === 'network' ? 'network' : 'failed')
      }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, CHROME_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [injected, user])

  const value = useMemo<ConsoleContextValue>(() => {
    const chromeError = failure === 'network'
      ? t(lang, chromeCopy.offline)
      : failure === 'failed'
        ? t(lang, chromeCopy.failed)
        : null
    return {
      supervisor: {
        id: me?.id ?? '',
        displayName: me?.displayName ?? '',
        role: 'supervisor',
      },
      language: lang,
      activeMenu: consoleMenu(pathname) ?? 'incidents',
      approvalsCount: picture?.approvalsCount ?? null,
      serverTime: picture?.serverTime ?? null,
      clockSkewMs,
      agency: picture?.agency ?? null,
      chromeError,
    }
  }, [me?.id, me?.displayName, lang, pathname, picture, clockSkewMs, failure])

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
}

export function useConsole(): ConsoleContextValue {
  const value = useContext(ConsoleContext)
  if (!value) throw new Error('useConsole must be used within ConsoleProvider')
  return value
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { USE_MOCK_API } from '../pwa/api/config'
import { ApiError } from '../pwa/api/types'
import { t, type Lang } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { fetchConsoleChrome, mockConsoleChrome, type ConsoleChrome, type DashboardCharts, type LiveFire, type ReignitionAlert, type SeasonImpact } from './chromeClient'
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
  /** null until the first dashboard read that includes the banner. */
  liveFires: LiveFire[] | null
  updatedAt: string | null
  nextSatellitePass: string | null
  /** null until the first dashboard read that includes season impact. */
  seasonImpact: SeasonImpact | null
  /** null until the first dashboard read that includes the charts. */
  charts: DashboardCharts | null
  /** undefined until the first dashboard read that includes the key. null = no alert. */
  reignitionAlert: ReignitionAlert | null | undefined
  /** The last picture is still showing while a refresh failed. */
  bannerRetrying: boolean
  /** Re-read GET /dashboard after dismiss or send. */
  reloadChrome(): Promise<void>
  /** Patch only the re-ignition alert on the last picture (tests and post-write). */
  setReignitionAlert(alert: ReignitionAlert | null): void
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

  const loadChrome = useCallback(async () => {
    if (injected) return
    try {
      let next: ConsoleChrome
      if (USE_MOCK_API) {
        next = mockConsoleChrome()
      } else {
        const { authHeadersFor } = await import('../pwa/api/authHeaders')
        next = await fetchConsoleChrome(authHeadersFor(user))
      }
      setPicture(next)
      setClockSkewMs(skewOf(next.serverTime))
      setFailure(null)
    } catch (err) {
      setFailure(err instanceof ApiError && err.code === 'network' ? 'network' : 'failed')
    }
  }, [injected, user])

  useEffect(() => {
    if (injected) return
    void loadChrome()
    const timer = window.setInterval(() => { void loadChrome() }, CHROME_POLL_MS)
    return () => { window.clearInterval(timer) }
  }, [injected, loadChrome])

  const setReignitionAlert = useCallback((alert: ReignitionAlert | null) => {
    setPicture((current) => (current ? { ...current, reignitionAlert: alert } : current))
  }, [])

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
      liveFires: picture && 'liveFires' in picture ? (picture.liveFires ?? []) : null,
      updatedAt: picture?.updatedAt ?? picture?.serverTime ?? null,
      nextSatellitePass: picture?.nextSatellitePass ?? null,
      seasonImpact: picture && 'seasonImpact' in picture ? (picture.seasonImpact ?? null) : null,
      charts: picture && 'charts' in picture ? (picture.charts ?? null) : null,
      reignitionAlert: picture && 'reignitionAlert' in picture ? (picture.reignitionAlert ?? null) : undefined,
      bannerRetrying: failure !== null,
      reloadChrome: loadChrome,
      setReignitionAlert,
    }
  }, [me?.id, me?.displayName, lang, pathname, picture, clockSkewMs, failure, loadChrome, setReignitionAlert])

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConsole(): ConsoleContextValue {
  const value = useContext(ConsoleContext)
  if (!value) throw new Error('useConsole must be used within ConsoleProvider')
  return value
}

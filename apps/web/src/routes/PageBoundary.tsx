import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'

import { t } from '../pwa/i18n'
import { useLanguage } from '../pwa/language'
import { copy } from './copy'
import { CheckingScreen } from './RoleHome'
import './login.css'

function LoadFailed() {
  const { lang } = useLanguage()
  return (
    <main className="role-screen">
      <h1>{t(lang, copy.loadFailed.title)}</h1>
      <p className="sub">{t(lang, copy.loadFailed.body)}</p>
      <button className="action-button" type="button" onClick={() => window.location.reload()}>
        {t(lang, copy.loadFailed.action)}
      </button>
    </main>
  )
}

class LoadErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page failed to load', error, info.componentStack)
  }

  render() {
    return this.state.failed ? <LoadFailed /> : this.props.children
  }
}

/** Wraps a lazily loaded page: a loading screen while it downloads and a retry screen if it cannot. */
export function PageBoundary({ children }: { children: ReactNode }) {
  return (
    <LoadErrorBoundary>
      <Suspense fallback={<CheckingScreen />}>{children}</Suspense>
    </LoadErrorBoundary>
  )
}

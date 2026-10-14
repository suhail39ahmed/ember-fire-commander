import { useEffect, useState } from 'react'
import { strings, t, type Lang } from '../i18n'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

/** Install prompt (Android/desktop Chrome) or iPhone instructions; hidden once installed. */
export function InstallBanner({ lang }: { lang: Lang }) {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone())

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null
  if (evt)
    return (
      <div className="install">
        <button type="button" className="btn secondary" onClick={() => void evt.prompt().then(() => setEvt(null))}>
          {t(lang, strings.install)}
        </button>
      </div>
    )
  if (isIos()) return <p className="install muted">{t(lang, strings.installIos)}</p>
  return null
}

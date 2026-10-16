import { useState, useSyncExternalStore } from 'react'
import { strings, t, type Lang } from '../i18n'
import { dismissInstall, getInstallPromptStore, isDismissed, isIosDevice } from './installPrompt'

const idle = { offer: null, installed: false } as const
const noop = () => () => undefined

/**
 * Install prompt (Android/desktop Chrome) or iPhone/iPad instructions. Hidden once installed, and for 7 days after
 * "Not now". The browser's offer is captured at start-up (see installPrompt.ts), so it is still here when this mounts.
 */
export function InstallBanner({ lang }: { lang: Lang }) {
  const store = getInstallPromptStore()
  const state = useSyncExternalStore(store?.subscribe ?? noop, store?.getSnapshot ?? (() => idle), () => idle)
  const [dismissed, setDismissed] = useState(() => isDismissed())

  if (state.installed || dismissed) return null
  const notNow = (
    <button
      type="button"
      className="btn small"
      onClick={() => {
        dismissInstall()
        setDismissed(true)
      }}
    >
      {t(lang, strings.installLater)}
    </button>
  )
  if (state.offer)
    return (
      <div className="install">
        <button type="button" className="btn secondary" onClick={() => void store?.install()}>
          {t(lang, strings.install)}
        </button>
        {notNow}
      </div>
    )
  if (isIosDevice(navigator)) {
    return (
      <div className="install">
        <p className="muted">{t(lang, strings.installIos)}</p>
        {notNow}
      </div>
    )
  }
  return null
}

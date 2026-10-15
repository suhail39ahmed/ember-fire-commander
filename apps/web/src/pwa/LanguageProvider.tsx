import { useMemo, useSyncExternalStore, type ReactNode } from 'react'

import { t, type Lang } from './i18n'
import { getAppLanguageStore, LanguageContext, useLanguage, type LanguageStore, type LanguageValue } from './language'
import './language.css'

export function LanguageProvider({ children, store }: { children: ReactNode; store?: LanguageStore }) {
  const source = useMemo(() => store ?? getAppLanguageStore(), [store])
  const lang = useSyncExternalStore(source.subscribe, source.get, source.get)
  const value = useMemo<LanguageValue>(() => ({ lang, setLang: source.set }), [lang, source])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

const OPTIONS: { code: Lang; label: Lang }[] = [
  { code: 'id', label: 'id' },
  { code: 'en', label: 'en' },
]
const NAMES = { id: 'Bahasa Indonesia', en: 'English' } as const
const GROUP = { id: 'Bahasa', en: 'Language' }

/** ID / EN switch. Reused by every screen that shows UI text. */
export function LanguageToggle() {
  const { lang, setLang } = useLanguage()
  return (
    <div className="lang-toggle" role="group" aria-label={t(lang, GROUP)}>
      {OPTIONS.map(({ code }) => (
        <button
          key={code}
          type="button"
          className="lang-toggle-option"
          lang={code}
          aria-label={NAMES[code]}
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

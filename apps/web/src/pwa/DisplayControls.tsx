import { useEffect, useRef, useState } from 'react'

import { LANGUAGES, t, type LanguageCode } from './i18n'
import { useLanguage } from './language'
import { THEMES, useTheme, type Theme, type ThemeStore } from './theme'
import './displayControls.css'

const copy = {
  language: { id: 'Bahasa', en: 'Language' },
  theme: { id: 'Tema', en: 'Theme' },
  light: { id: 'Terang', en: 'Light' },
  dark: { id: 'Gelap', en: 'Dark' },
} as const

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </svg>
  )
}

/**
 * Language dropdown. It lists every entry of LANGUAGES, so a new language is one more entry there and no layout change.
 * `defaultOpen` is for tests and screenshots.
 */
export function LanguageDropdown({ defaultOpen = false, placement = 'down' }: { defaultOpen?: boolean; placement?: 'down' | 'up' }) {
  const { lang, language: chosen, setLang } = useLanguage()
  const [open, setOpen] = useState(defaultOpen)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const current = LANGUAGES.find((language) => language.code === chosen) ?? LANGUAGES[0]

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const choose = (code: LanguageCode) => {
    setLang(code)
    setOpen(false)
    button.current?.focus()
  }

  return (
    <div
      className={placement === 'up' ? 'lang-menu lang-menu-up' : 'lang-menu'}
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          button.current?.focus()
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className="lang-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t(lang, copy.language)}: ${current.name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span lang={current.code}>{current.short}</span>
        <Chevron />
      </button>
      {open && (
        <ul className="lang-menu-list" role="menu" aria-label={t(lang, copy.language)}>
          {LANGUAGES.map((language) => (
            <li key={language.code} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={language.code === chosen}
                lang={language.code}
                className="lang-menu-item"
                onClick={() => choose(language.code)}
              >
                <span className="lang-menu-short">{language.short}</span>
                {language.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Dark / Light switch. The choice is kept in this browser and changes the page at once. */
export function ThemeSwitch({ store }: { store?: ThemeStore }) {
  const { lang } = useLanguage()
  const { theme, setTheme } = useTheme(store)
  const label: Record<Theme, string> = { light: t(lang, copy.light), dark: t(lang, copy.dark) }
  const order: Theme[] = [...THEMES].sort((a) => (a === 'dark' ? -1 : 1))
  return (
    <div className="theme-switch" role="group" aria-label={t(lang, copy.theme)}>
      {order.map((value) => (
        <button
          key={value}
          type="button"
          className="theme-switch-option"
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
        >
          {value === 'dark' ? <MoonIcon /> : <SunIcon />}
          {label[value]}
        </button>
      ))}
    </div>
  )
}

/** The language dropdown and theme switch, as one block. The console top bar and the sign-in screen both use it. */
export function DisplayControls() {
  return (
    <div className="display-controls">
      <LanguageDropdown />
      <ThemeSwitch />
    </div>
  )
}

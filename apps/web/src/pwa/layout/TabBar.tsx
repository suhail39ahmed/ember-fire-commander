import { NavLink } from 'react-router-dom'

import { t, type Lang } from '../i18n'
import { screenStrings } from '../screens/strings'

const ICONS = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  incidents: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  report: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8',
  guide: 'M3 5.5C5 4.5 8 4.5 12 6.5c4-2 7-2 9-1V19c-2-1-5-1-9 1-4-2-7-2-9-1zM12 6.5V20',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
} as const

export const TABS = [
  { key: 'home', to: '/pwa', end: true },
  { key: 'incidents', to: '/pwa/incidents', end: false },
  { key: 'report', to: '/pwa/report', end: false },
  { key: 'guide', to: '/pwa/guide', end: false },
  { key: 'profile', to: '/pwa/profile', end: false },
] as const

/** The five bottom tabs. Report is the raised centre button. The active tab follows the route. */
export function TabBar({ lang }: { lang: Lang }) {
  return (
    <nav className="tabbar" aria-label={t(lang, screenStrings.tabs.label)}>
      {TABS.map((tab) => (
        <NavLink key={tab.key} to={tab.to} end={tab.end} className={`tab tab-${tab.key}`} data-testid={`tab-${tab.key}`}>
          <span className="tab-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICONS[tab.key]} />
            </svg>
          </span>
          <span className="tab-label">{t(lang, screenStrings.tabs[tab.key])}</span>
        </NavLink>
      ))}
    </nav>
  )
}

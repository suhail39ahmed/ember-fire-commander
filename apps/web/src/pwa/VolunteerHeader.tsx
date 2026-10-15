import { strings, t, type Lang } from './i18n'
import { LanguageToggle } from './LanguageProvider'

/**
 * Volunteer app header. Always 64px tall: the name and crew lines each stay on one line
 * (long text is cut with an ellipsis) and the ID | EN toggle never shrinks, so the
 * header looks the same in both languages and on every screen width.
 */
export function VolunteerHeader({ name, lang }: { name: string | null | undefined; lang: Lang }) {
  return (
    <header className="vol-header">
      <img src="/brand/ember-emblem.svg" alt="" width={28} height={28} />
      <div className="vol-title">
        <strong>{name || 'EMBER'}</strong>
        <span className="vol-sub">{t(lang, strings.team)}</span>
      </div>
      <LanguageToggle />
    </header>
  )
}

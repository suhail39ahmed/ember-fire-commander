import { t, type Lang } from './i18n'
import { LanguageToggle } from './LanguageProvider'
import { screenStrings } from './screens/strings'

/**
 * Volunteer app header. Always 64px tall: the name and crew lines each stay on one line
 * (long text is cut with an ellipsis) and the ID | EN toggle never shrinks, so the
 * header looks the same in both languages and on every screen width.
 * The crew line is `crewName` from GET /me. With no crew it says so instead of showing a made-up one.
 */
export function VolunteerHeader({
  name,
  crew,
  lang,
}: {
  name: string | null | undefined
  crew?: string | null
  lang: Lang
}) {
  return (
    <header className="vol-header">
      <img src="/brand/ember-emblem.svg" alt="" width={28} height={28} />
      <div className="vol-title">
        <strong>{name || 'EMBER'}</strong>
        <span className="vol-sub">{crew?.trim() || t(lang, screenStrings.profile.crewUnknown)}</span>
      </div>
      <LanguageToggle />
    </header>
  )
}

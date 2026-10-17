import { LanguageDropdown } from './DisplayControls'
import { t, type Lang } from './i18n'
import { screenStrings } from './screens/strings'

/**
 * Volunteer app header (Figma "App header"). Always 64px tall: the name and crew lines each stay on one line
 * (long text is cut with an ellipsis) and the language dropdown, the same one the sign-in screen uses, never
 * shrinks, so the header looks the same in every language and on every screen width.
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
      <img src="/brand/ember-emblem.svg" alt="" width={32} height={32} />
      <div className="vol-title">
        <strong>{name || 'EMBER'}</strong>
        <span className="vol-sub">{crew?.trim() || t(lang, screenStrings.profile.crewUnknown)}</span>
      </div>
      <LanguageDropdown />
    </header>
  )
}

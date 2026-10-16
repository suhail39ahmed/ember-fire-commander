import { t, type Lang } from '../../pwa/i18n'
import { agencyCopy } from './disagreeCopy'
import './extras.css'

/**
 * The agency recorded as in charge of the incident, exactly as stored. Nothing stores one today, so the
 * usual state is the marked empty one. The signed-in supervisor's own agency is shown apart and labelled as theirs:
 * it is never presented as the agency in charge, and nothing here hands an incident to an agency.
 */
export function AgencyInCharge({ lang, agency, yours }: { lang: Lang; agency: string | null | undefined; yours: string | null | undefined }) {
  const stored = agency?.trim() || null
  const own = yours?.trim() || null
  return (
    <section className="inc-card agency" aria-labelledby="inc-agency-title">
      <h2 className="inc-h2" id="inc-agency-title">{t(lang, agencyCopy.title)}</h2>
      {stored ? (
        <p className="agency-name">{stored}</p>
      ) : (
        <>
          <p className="agency-name agency-empty">{t(lang, agencyCopy.notRecorded)}</p>
          <p className="inc-muted">{t(lang, agencyCopy.emptyBody)}</p>
        </>
      )}
      {own && <p className="inc-muted agency-yours">{t(lang, agencyCopy.yours)}: {own}</p>}
    </section>
  )
}

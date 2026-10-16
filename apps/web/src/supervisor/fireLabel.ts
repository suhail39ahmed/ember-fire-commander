import type { Lang } from '../pwa/i18n'
import { incidentLabel } from '../pwa/incidentName'
import type { LiveFire } from './chromeClient'
import type { Incident } from './contracts'

/** The banner names a fire like every other screen does: the incident's name, never its id. */
export function fireLabel(fire: LiveFire, queue: Incident[] | null | undefined, lang: Lang): string {
  const incident = queue?.find((i) => i.id === fire.id)
  const label = incident
    ? incidentLabel(incident, lang)
    : incidentLabel({ id: fire.id, area: fire.placeName }, lang)
  return fire.code ? `${fire.code} · ${label}` : label
}

import type { NearbyIncident } from '../contracts/types'
import { t, type Lang } from '../i18n'
import { incidentLabel } from '../incidentName'
import { bearingLabel, crewLine, distanceLabel, type NearbyState } from './nearby'
import { screenStrings } from './strings'

const copy = screenStrings.nearby

/** "TOHOR-3 · Peat field behind SDN 2. Small flame, 4 on site." Only what the API sent: no wind, no pump request. */
function summaryLine(incident: NearbyIncident, lang: Lang): string {
  const parts = [t(lang, screenStrings.severity[incident.severity])]
  if (incident.crewOnSite > 0) parts.push(`${incident.crewOnSite} ${t(lang, copy.onSite)}`)
  return `${incidentLabel(incident, lang)}. ${parts.join(', ')}.`
}

/** The AI card (Figma "AI suggestion · Join nearby fire"). Join and help opens the sheet, Not now puts it aside. */
export function AiSuggestCard({ incident, lang, onJoin, onDismiss }: { incident: NearbyIncident; lang: Lang; onJoin: () => void; onDismiss: () => void }) {
  const name = incident.reporterName?.trim()
  return (
    <section className="ai-card" aria-labelledby="ai-card-title" data-testid="ai-card">
      <p className="ai-tag">
        {t(lang, copy.aiTag)} · {distanceLabel(incident.distanceM)} {t(lang, copy.fromYou)}
      </p>
      <h2 id="ai-card-title" className="ai-title">
        {name ? `${name} ${t(lang, copy.aiTitleNamed)}` : t(lang, copy.aiTitleUnnamed)}
      </h2>
      <p className="ai-body">{summaryLine(incident, lang)}</p>
      <div className="ai-actions">
        <button type="button" className="pill ink" onClick={onJoin} data-testid="ai-join">
          {t(lang, copy.joinAndHelp)}
        </button>
        <button type="button" className="pill ghost" onClick={onDismiss} data-testid="ai-dismiss">
          {t(lang, copy.notNow)}
        </button>
      </div>
      <p className="ai-foot">{t(lang, copy.aiFoot)}</p>
    </section>
  )
}

function SeverityBadge({ severity, lang }: { severity: NearbyIncident['severity']; lang: Lang }) {
  return (
    <span className="sev-badge">
      <span className={`sev-dot sev-${severity}`} aria-hidden="true" />
      {t(lang, screenStrings.severity[severity])}
    </span>
  )
}

/** One fire in "Incidents near you". Opens the join sheet. A fire already asked for, or declined, says so. */
export function NearbyCard({ incident, lang, state, onOpen }: { incident: NearbyIncident; lang: Lang; state: NearbyState; onOpen: () => void }) {
  const crew = crewLine(incident, lang)
  const status = incident.status === 'held' ? t(lang, screenStrings.detail.heldChip) : t(lang, screenStrings.status[incident.status])
  const note = state === 'waiting' ? copy.waiting : state === 'declined' ? copy.declined : copy.notAssigned
  return (
    <li>
      <button type="button" className="near-card" onClick={onOpen} data-testid={`near-${incident.id}`} aria-haspopup="dialog">
        <span className="near-top">
          <span className={`near-status st-${incident.status}`}>
            <span className="near-dot" aria-hidden="true" />
            {status}
          </span>
          <span className="near-meta">{distanceLabel(incident.distanceM)} · {bearingLabel(incident.bearingDeg, lang)}</span>
        </span>
        <span className="near-title">{incidentLabel(incident, lang)}</span>
        <span className="near-row">
          <SeverityBadge severity={incident.severity} lang={lang} />
          {crew && <span className="near-sub">{crew}</span>}
        </span>
        <span className="near-note" data-state={state}>{t(lang, note)}</span>
      </button>
    </li>
  )
}

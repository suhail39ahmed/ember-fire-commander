import { t, type Lang } from '../pwa/i18n'
import { listCopy } from './listCopy'
import { labelInArea, areaOf, type AreaGroup } from './queueGroups'
import { SEVERITY_LABEL, STATUS_LABEL } from './view'
import type { Incident } from './contracts'

const EMPTY = '—'

function countOf(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : EMPTY
}

function incidentCounts(incidents: Incident[]) {
  return {
    open: incidents.filter((incident) => incident.status === 'open').length,
    held: incidents.filter((incident) => incident.status === 'held').length,
    verified: incidents.filter((incident) => incident.status === 'verified').length,
  }
}

function CountChips({ incidents, lang }: { incidents: Incident[]; lang: Lang }) {
  const counts = incidentCounts(incidents)
  const chips = [
    { label: listCopy.open, value: String(counts.open) },
    { label: listCopy.held, value: String(counts.held) },
    { label: listCopy.verified, value: String(counts.verified) },
    { label: listCopy.closed, value: EMPTY },
  ]
  return (
    <div className="incident-counts">
      {chips.map((chip) => (
        <span key={chip.label.en} className="incident-count">
          {t(lang, chip.label)} {chip.value}
        </span>
      ))}
    </div>
  )
}

/** Incident queue: count chips, then one labelled list per area. */
export function IncidentQueue({
  groups,
  activeId,
  onSelect,
  lang = 'en',
}: {
  groups: AreaGroup[]
  activeId: string | null
  onSelect(id: string): void
  lang?: Lang
}) {
  const incidents = groups.flatMap((group) => group.incidents)
  return (
    <div className="incident-list">
      <div className="incident-list-head">
        <h2 className="incident-list-title">{t(lang, listCopy.title)}</h2>
        <CountChips incidents={incidents} lang={lang} />
      </div>
      <div className="sup-queue-groups" role="group" aria-label="Incident queue">
        {groups.map((group, index) => {
          const headingId = `queue-area-${index}`
          return (
            <section key={group.area} className="sup-queue-group" aria-labelledby={headingId}>
              <h3 id={headingId} className="sup-queue-area">
                {group.area} ({group.incidents.length})
              </h3>
              <ul className="sup-queue">
                {group.incidents.map((incident) => (
                  <li key={incident.id}>
                    <button
                      type="button"
                      className={`sup-queue-item${incident.id === activeId ? ' active' : ''}`}
                      aria-current={incident.id === activeId ? 'true' : undefined}
                      onClick={() => onSelect(incident.id)}
                    >
                      <span className="incident-row-status">
                        {incident.withdraw?.active ? 'WITHDRAW · ' : ''}{STATUS_LABEL[incident.status]} · {SEVERITY_LABEL[incident.severity]}
                        {incident.needsHelp && <span className="incident-need-help">{t(lang, listCopy.needHelp)}</span>}
                      </span>
                      <span>{labelInArea(incident, group.area, lang)}</span>
                      <span className="sup-queue-meta">{areaOf(incident)}</span>
                      <span className="sup-queue-meta">
                        {countOf(incident.reportCount)} {t(lang, listCopy.reports)} · {countOf(incident.volunteerCount)} {t(lang, listCopy.volunteers)} · {t(lang, listCopy.evidence)} {incident.evidenceScore}
                      </span>
                      {incident.status === 'verified' && (
                        <span className="sup-queue-meta">{t(lang, listCopy.verifiedBy)} {incident.verifiedBy?.trim() || EMPTY}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

import { labelInArea, type AreaGroup } from './queueGroups'
import { SEVERITY_LABEL, STATUS_LABEL } from './view'

/** Sidebar queue: one labelled list per area, rows in the order given. */
export function IncidentQueue({
  groups,
  activeId,
  onSelect,
}: {
  groups: AreaGroup[]
  activeId: string | null
  onSelect(id: string): void
}) {
  return (
    <div className="sup-queue-groups" role="group" aria-label="Incident queue">
      {groups.map((group, index) => {
        const headingId = `queue-area-${index}`
        return (
          <section key={group.area} className="sup-queue-group" aria-labelledby={headingId}>
            <h2 id={headingId} className="sup-queue-area">
              {group.area} ({group.incidents.length})
            </h2>
            <ul className="sup-queue">
              {group.incidents.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className={`sup-queue-item${i.id === activeId ? ' active' : ''}`}
                    aria-current={i.id === activeId}
                    onClick={() => onSelect(i.id)}
                  >
                    <span>{labelInArea(i, group.area)}</span>
                    <span className="sup-queue-meta">
                      {i.withdraw?.active ? 'WITHDRAW · ' : ''}{STATUS_LABEL[i.status]} · {SEVERITY_LABEL[i.severity]} · {i.evidenceScore}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

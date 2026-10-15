/**
 * Readable incident names (section 5.2). Agents write `name` when they create an
 * incident. Incidents from before that, and any that could not be named, show a
 * short form of the id instead of the whole Firestore id.
 */
export interface Nameable {
  id: string
  name?: string | null
}

/** "4kQ9xZ7hLm" -> "INC-7HLM". */
export function shortIncidentId(id: string): string {
  return `INC-${id.slice(-4).toUpperCase()}`
}

export function incidentLabel(incident: Nameable): string {
  const name = incident.name?.trim()
  return name ? name : shortIncidentId(incident.id)
}

/** Label for an incident known only by id, such as a task's `incidentId`. */
export function incidentLabelById(id: string, incidents: Nameable[] | null | undefined): string {
  const found = incidents?.find((i) => i.id === id)
  return found ? incidentLabel(found) : shortIncidentId(id)
}

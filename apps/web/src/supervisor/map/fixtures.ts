/**
 * Regional fixture: three synthetic incidents at distinct positions for the map.
 * The first is the demo incident; the others are fictional. SIMULATED data only.
 */
import type { IncidentDetail } from '../contracts'
import { fixture } from '../fixtures'

export function regionFixtures(): IncidentDetail[] {
  const conflict = fixture('conflict')
  const normal = fixture('normal')
  const withdraw = fixture('withdraw')
  const retag = (d: IncidentDetail, id: string, lat: number, lng: number): IncidentDetail => ({
    ...d,
    incident: { ...d.incident, id, lat, lng, conflictId: d.conflict ? `con_${id}` : null },
    conflict: d.conflict ? { ...d.conflict, id: `con_${id}`, incidentId: id } : null,
    tasks: d.tasks.map((t) => ({ ...t, id: `${t.id}_${id}`, incidentId: id })),
  })
  return [
    conflict,
    retag(normal, 'inc_demo_02', -1.8205, 110.0932),
    retag(withdraw, 'inc_demo_03', -1.8817, 110.0221),
  ]
}

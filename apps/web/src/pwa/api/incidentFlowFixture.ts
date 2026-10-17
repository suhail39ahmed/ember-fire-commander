/** Synthetic API fixtures for visual verification of #195; never used by the HTTP client. */
import type { Digest, IncidentDetail, Observation } from '../contracts/types'

export function incidentFlowFixture(volunteerId: string): { digest: Digest; details: Map<string, IncidentDetail> } {
  const now = new Date()
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString()
  const held = {
    id: 'inc_demo_01', name: 'TOHOR-3 · Peat field behind SDN 2', code: 'TOHOR-3', placeName: 'Peat field behind SDN 2', area: 'Desa Tohor',
    status: 'held' as const, severity: 'small_flame' as const, withdraw: null, lat: 1.482, lng: 102.115,
    updatedAt: ago(12), closedAt: null, reportCount: 4, myReportCount: 2, participantCount: 4, includesMe: true,
  }
  const live = { ...held, id: 'inc_demo_02', name: 'TOHOR-5 · Canal bend, east', code: 'TOHOR-5', placeName: 'Canal bend, east', status: 'open' as const, severity: 'smoke' as const, reportCount: 2, myReportCount: 1, participantCount: 2, lng: 102.118 }
  const completed = [
    { code: 'KARIMUN-1', placeName: 'Farm edge', severity: 'smoke' as const, days: 5, reports: 6 },
    { code: 'TOHOR-1', placeName: 'Canal north', severity: 'small_flame' as const, days: 14, reports: 3 },
    { code: 'TOHOR-2', placeName: 'School field', severity: 'smoke' as const, days: 19, reports: 2 },
  ].map((row, index) => ({ ...held, id: `inc_completed_${index + 1}`, name: `${row.code} · ${row.placeName}`, code: row.code, placeName: row.placeName, severity: row.severity, status: 'extinguished' as const, closedAt: ago(row.days * 1440), updatedAt: ago(row.days * 1440), reportCount: row.reports, myReportCount: 1, participantCount: 2 }))
  const reports: Observation[] = [
    { id: 'fixture_01', volunteerId: 'uid_ani', volunteerName: 'Ani', capturedAt: ago(2), receivedAt: ago(2), source: 'photo', text: 'Thin smoke near the school fence', chip: null, severity: 'smoke', lat: 1.4822, lng: 102.1148, accuracyM: 12, photoPath: null, immutable: true },
    { id: 'fixture_02', volunteerId: 'uid_rizal', volunteerName: 'Rizal', capturedAt: ago(13), receivedAt: ago(13), source: 'chip', text: 'No flame at the canal edge', chip: 'aman', severity: 'none', lat: 1.4818, lng: 102.1154, accuracyM: 20, photoPath: null, immutable: true },
    { id: 'fixture_03', volunteerId, volunteerName: 'Pak Dedi', capturedAt: ago(15), receivedAt: ago(15), source: 'chip', text: 'Small flame by the canal', chip: 'api', severity: 'small_flame', lat: 1.4819, lng: 102.1145, accuracyM: 18, photoPath: null, immutable: true },
    { id: 'fixture_04', volunteerId, volunteerName: 'Pak Dedi', capturedAt: ago(41), receivedAt: ago(41), source: 'chip', text: 'Thin smoke', chip: 'asap', severity: 'smoke', lat: 1.4819, lng: 102.1145, accuracyM: 18, photoPath: null, immutable: true },
  ]
  const task = { id: 'task_demo_verify', incidentId: held.id, volunteerId, type: 'verify' as const, status: 'approved' as const, reasonCode: 'reports_disagree' as const, instruction: 'Go back to the canal edge and check: is there flame?', createdAt: ago(13), sentAt: ago(12) }
  const conflict = { id: 'con_demo', incidentId: held.id, observationIds: ['fixture_02', 'fixture_03'], higherSeverity: 'small_flame' as const, status: 'open', dispatchHeld: true }
  const details = new Map<string, IncidentDetail>([[held.id, {
    incident: { ...held, evidenceScore: 64, conflictId: conflict.id }, observations: reports, conflict, tasks: [task],
    conflictSummary: { dispatchHeld: true, reports: reports.filter((row) => conflict.observationIds.includes(row.id)).map((row) => ({ observationId: row.id, volunteerId: row.volunteerId, volunteerName: row.volunteerName || null, severity: row.severity })), instruction: task.instruction, supervisorName: 'Bu Maya' },
  }], [live.id, { incident: { ...live, evidenceScore: 42 }, observations: [{ ...reports[3], id: 'live_report', severity: 'smoke', text: 'Smoke at the east canal bend' }, { ...reports[1], id: 'live_rizal', severity: 'smoke', chip: 'asap', text: 'Smoke visible near the east bend' }], conflict: null, conflictSummary: null, tasks: [] }]])
  for (const incident of completed) {
    const count = incident.reportCount
    const observations = Array.from({ length: count }, (_, index): Observation => ({
      ...reports[3], id: `${incident.id}_report_${index}`, volunteerId: index === 0 ? volunteerId : 'uid_rizal', volunteerName: index === 0 ? 'Pak Dedi' : 'Rizal',
      lat: index === 0 ? reports[3].lat : reports[1].lat, lng: index === 0 ? reports[3].lng : reports[1].lng,
      capturedAt: new Date(Date.parse(incident.closedAt) - (count - index) * 60000).toISOString(), receivedAt: new Date(Date.parse(incident.closedAt) - (count - index) * 60000).toISOString(), text: index === count - 1 ? 'No smoke visible at the site' : 'Smoke near the field', severity: index === count - 1 ? 'none' : incident.severity,
    }))
    details.set(incident.id, { incident: { ...incident, evidenceScore: 36 }, observations, conflict: null, conflictSummary: null, tasks: [] })
  }
  return { digest: { updatedAt: now.toISOString(), incidents: [held, live, ...completed], myTasks: [task], nearby: [], seasonStats: { checksDone: 1, falseAlarmsCleared: 0 } }, details }
}

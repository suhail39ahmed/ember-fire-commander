/**
 * Incident-list labels. Bahasa is DRAFT and needs native-speaker review.
 * Status and severity stay on the existing English labels in view.ts.
 * Code, place, report count, volunteer count, verified-by, and Closed have no
 * list field, so those slots stay an em dash.
 */
export const listCopy = {
  title: { id: 'Insiden', en: 'Incidents' },
  open: { id: 'Terbuka', en: 'Open' },
  held: { id: 'Ditahan', en: 'Held' },
  verified: { id: 'Terverifikasi', en: 'Verified' },
  closed: { id: 'Ditutup', en: 'Closed' },
  reports: { id: 'laporan', en: 'reports' },
  volunteers: { id: 'relawan', en: 'volunteers' },
  evidence: { id: 'bukti', en: 'evidence' },
  verifiedBy: { id: 'Diverifikasi oleh', en: 'Verified by' },
} as const

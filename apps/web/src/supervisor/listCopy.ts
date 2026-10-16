/**
 * Incident-list labels. Bahasa is DRAFT and needs native-speaker review.
 * Status and severity stay on the existing English labels in view.ts.
 * Report count, volunteer count and verified-by come from the supervisor list. A value the server
 * did not send, and the Closed count (an extinguished incident leaves the list), stay an em dash.
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
  needHelp: { id: 'BUTUH BANTUAN', en: 'NEED HELP' },
  verifiedBy: { id: 'Diverifikasi oleh', en: 'Verified by' },
} as const

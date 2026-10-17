/** Copy for the "Reports disagree" state of the incident detail. Bahasa is a draft that needs native-speaker review. */
export const disagreeCopy = {
  bannerTitle: { id: 'Laporan berbeda — dispatch ditahan', en: 'Reports disagree — dispatch on hold' },
  bannerResolved: { id: 'Konflik selesai', en: 'Conflict resolved' },
  says: { id: 'bilang', en: 'says' },
  apart: { id: 'berjarak', en: 'apart' },
  bannerRule: {
    id: 'Kode mempertahankan tingkat yang lebih tinggi dan membuat tugas verifikasi untuk masing-masing. Setujui keduanya untuk mengirim mereka kembali.',
    en: 'Code kept the higher severity and created a verify task for each. Approve them to send both back.',
  },
  original: { id: 'LAPORAN ASLI · TIDAK DIUBAH', en: 'ORIGINAL REPORT · UNCHANGED' },
  proposals: { id: 'Usulan', en: 'Proposals' },
  proposedWord: { id: 'USULAN', en: 'PROPOSED' },
  heldLine: { id: '409 · Dispatch tidak bisa disetujui selama laporan berbeda', en: '409 · Can’t approve dispatch while reports disagree' },
  factorsTitle: { id: 'Mengapa bukti bernilai', en: 'Why evidence is' },
  factorsEmpty: { id: 'Belum ada rincian bukti dari ember-api.', en: 'ember-api has not sent the evidence factors.' },
  notProbability: { id: 'Skor ini bukan probabilitas.', en: 'This score is not a probability.' },
  auditNote: { id: 'Entri audit terbaru ada di Log audit.', en: 'The latest audit entries are in the Audit log.' },
  otherTitle: { id: 'Laporan lain di insiden ini', en: 'Other reports at this incident' },
  otherNote: { id: 'tidak di pihak mana pun dalam perbedaan', en: 'on neither side of the disagreement' },
  decisionsTitle: { id: 'Keputusan atas perbedaan ini', en: 'Decisions on this disagreement' },
  decisionsNote: { id: 'dari catatan audit', en: 'from the audit records' },
  decisionsEmpty: { id: 'Belum ada keputusan yang tercatat.', en: 'No decision has been recorded yet.' },
  openedGap: { id: 'Tidak ada catatan kapan perbedaan ini muncul.', en: 'No record shows when the disagreement opened.' },
  allTitle: { id: 'Semua laporan di insiden ini', en: 'All reports at this incident' },
  allNote: { id: 'kedua pihak termasuk, dari yang terlama', en: 'both sides included, oldest first' },
  noInvestigate: {
    id: 'Agen belum mencatat usulan dispatch (investigasi) untuk insiden ini.',
    en: 'The agents have not recorded a dispatch (investigate) proposal for this incident.',
  },
} as const

/** Copy for "Agency in charge" on the incident detail. Bahasa is a draft that needs native-speaker review. */
export const agencyCopy = {
  title: { id: 'Instansi penanggung jawab', en: 'Agency in charge' },
  notRecorded: { id: 'Belum tercatat', en: 'Not recorded' },
  emptyBody: {
    id: 'Belum ada instansi yang tercatat sebagai penanggung jawab insiden ini.',
    en: 'No agency has been recorded as in charge of this incident.',
  },
  yours: { id: 'Instansi Anda (dari profil)', en: 'Your agency (from your profile)' },
} as const

export const factorName = {
  severity: { id: 'Tingkat', en: 'Severity' },
  corroboration: { id: 'Dukungan', en: 'Corroboration' },
  photo: { id: 'Foto', en: 'Photo' },
  gps: { id: 'GPS', en: 'GPS' },
  wind: { id: 'Angin', en: 'Wind' },
  satellite: { id: 'Satelit', en: 'Satellite' },
  conflict: { id: 'Konflik', en: 'Conflict' },
} as const

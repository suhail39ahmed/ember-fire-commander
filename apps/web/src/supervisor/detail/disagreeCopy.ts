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
} as const

export const factorName = {
  severity: { id: 'Tingkat', en: 'Severity' },
  corroboration: { id: 'Dukungan', en: 'Corroboration' },
  photo: { id: 'Foto', en: 'Photo' },
  gps: { id: 'GPS', en: 'GPS' },
  conflict: { id: 'Konflik', en: 'Conflict' },
} as const

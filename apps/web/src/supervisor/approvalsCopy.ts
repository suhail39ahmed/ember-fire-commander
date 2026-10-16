/** Approvals page labels. Bahasa is DRAFT and needs native-speaker review, like chromeCopy.ts. */
export const approvalsCopy = {
  title: { id: 'Persetujuan', en: 'Approvals' },
  waiting: { id: 'menunggu keputusan', en: 'waiting for a decision' },
  loading: { id: 'Memuat usulan…', en: 'Loading proposals…' },
  emptyTitle: { id: 'Tidak ada yang menunggu persetujuan', en: 'Nothing is waiting for approval' },
  emptyBody: {
    id: 'Usulan tugas dari agen muncul di sini. Daftar ini diperbarui otomatis.',
    en: 'Task proposals from the agents appear here. This list updates by itself.',
  },
  failed: { id: 'Usulan tidak bisa dimuat. Mencoba lagi.', en: 'Could not load the proposals. Retrying.' },
  noIncident: { id: 'Insiden tidak ditemukan', en: 'Incident not found' },
  openIncident: { id: 'Buka insiden', en: 'Open incident' },
} as const

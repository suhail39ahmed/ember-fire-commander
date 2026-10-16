/**
 * Audit log page copy. Bahasa is DRAFT and needs native-speaker review.
 */
export const auditCopy = {
  title: { id: 'Log audit', en: 'Audit log' },
  sub: {
    id: 'Hanya tambah. Setiap tindakan supervisor dan setiap WITHDRAW otomatis. Klien bisa membaca, tidak bisa menulis.',
    en: 'Append-only. Every supervisor action and every automatic WITHDRAW. Clients can read, never write.',
  },
  time: { id: 'Waktu', en: 'Time' },
  actor: { id: 'Aktor', en: 'Actor' },
  action: { id: 'Tindakan', en: 'Action' },
  target: { id: 'Sasaran', en: 'Target' },
  detail: { id: 'Detail', en: 'Detail' },
  empty: { id: 'Belum ada tindakan', en: 'No actions yet' },
  loading: { id: 'Memuat log…', en: 'Loading the log…' },
  loadMore: { id: 'Muat lebih banyak', en: 'Load more' },
  failed: {
    id: 'Log audit tidak bisa dimuat. Periksa koneksi lalu coba lagi.',
    en: 'Could not load the audit log. Check your connection and try again.',
  },
  retry: { id: 'Coba lagi', en: 'Try again' },
} as const

/**
 * Re-ignition alert labels. Bahasa is DRAFT and needs native-speaker review.
 * Distance, extinguished time, and message come from GET /dashboard.
 */
export const reignitionCopy = {
  watch: { id: 'PENGAWASAN NYALA KEMBALI', en: 'RE-IGNITION WATCH' },
  newLead: { id: 'Jejak satelit baru', en: 'New satellite lead' },
  from: { id: 'dari', en: 'from' },
  extinguished: { id: 'dipadamkan', en: 'extinguished' },
  ago: { id: 'yang lalu', en: 'ago' },
  day: { id: 'hari', en: 'day' },
  days: { id: 'hari', en: 'days' },
  hour: { id: 'jam', en: 'hour' },
  hours: { id: 'jam', en: 'hours' },
  peatNote: {
    id: 'Gambut bisa membara di bawah tanah selama berminggu-minggu. Kode menyusun tugas periksa ulang — perlu persetujuan Anda karena lokasi sudah ditutup.',
    en: 'Peat can smoulder underground for weeks. Code drafted a re-check task — it needs your approval because the site was closed.',
  },
  send: { id: 'Kirim tugas periksa ulang', en: 'Send re-check task' },
  dismiss: { id: 'Singkirkan dengan alasan', en: 'Dismiss with reason' },
  dismissTitle: { id: 'Singkirkan peringatan', en: 'Dismiss alert' },
  reasonLabel: { id: 'Alasan', en: 'Reason' },
  reasonHint: { id: 'Wajib. Tercatat di log audit.', en: 'Required. Recorded in the audit log.' },
  cancel: { id: 'Batal', en: 'Cancel' },
  confirmDismiss: { id: 'Singkirkan', en: 'Dismiss' },
  inProgress: { id: 'Tugas periksa ulang sedang menunggu persetujuan.', en: 'Re-check task is waiting for approval.' },
  sendFailed: {
    id: 'Tugas periksa ulang tidak terkirim. Coba lagi.',
    en: 'Could not send the re-check. Try again.',
  },
  dismissFailed: {
    id: 'Peringatan tidak bisa disingkirkan. Coba lagi.',
    en: 'Could not dismiss the alert. Try again.',
  },
} as const

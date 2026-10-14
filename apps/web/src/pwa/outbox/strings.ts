/** Outbox copy (#21). Bahasa Indonesia default; DRAFT, needs native-speaker review. */
export const outboxStrings = {
  label: { id: 'KOTAK KELUAR', en: 'OUTBOX' },
  offline: {
    id: 'Tidak ada sinyal. Laporan disimpan di ponsel ini dan dikirim otomatis saat sinyal kembali.',
    en: 'No signal. Reports are saved on this phone and sent automatically when signal returns.',
  },
  state: {
    queued: { id: 'Menunggu sinyal', en: 'Queued' },
    sending: { id: 'Mengirim…', en: 'Sending…' },
    failed: { id: 'Gagal', en: 'Failed' },
    sent: { id: 'Terkirim ✓', en: 'Sent ✓' },
  },
  photo: { id: 'Foto', en: 'Photo' },
  photoWaiting: { id: 'Foto (belum diunggah)', en: 'Photo (not uploaded yet)' },
  text: { id: 'Catatan', en: 'Note' },
  retry: { id: 'Coba lagi', en: 'Retry' },
  discard: { id: 'Hapus', en: 'Discard' },
  sendNow: { id: 'Kirim sekarang', en: 'Send now' },
  queuedReport: {
    id: 'Disimpan di ponsel ini. Dikirim otomatis saat sinyal kembali.',
    en: 'Saved on this phone. Sends automatically when signal returns.',
  },
  queuedPhoto: {
    id: 'Foto disimpan di ponsel ini. Diunggah otomatis saat sinyal kembali.',
    en: 'Photo saved on this phone. Uploads automatically when signal returns.',
  },
  queuedTitle: { id: 'Tersimpan di kotak keluar', en: 'Saved to outbox' },
} as const

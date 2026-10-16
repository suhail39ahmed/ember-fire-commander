/** Mark extinguished dialog labels. Bahasa is DRAFT and needs native-speaker review. */
export const extinguishCopy = {
  open: { id: 'Tandai padam', en: 'Mark extinguished' },
  titleBefore: { id: 'Tandai', en: 'Mark' },
  titleAfter: { id: 'padam?', en: 'extinguished?' },
  body: {
    id: 'Hanya supervisor yang bisa melakukan ini, dan tidak bisa dibatalkan dari konsol. Dicatat sebagai incident.extinguish oleh',
    en: 'Only a supervisor can do this, and it can’t be undone from the console. It is logged as incident.extinguish by',
  },
  bodyAfter: { id: 'pada saat Anda mengonfirmasi.', en: 'at the time you confirm.' },
  watchTitle: { id: 'Gambut bisa menyala lagi di bawah tanah', en: 'Peat can re-ignite underground' },
  watchBody: {
    id: 'Lokasi tetap dipantau untuk penyalaan ulang. Laporan baru di dekatnya memunculkan peringatan pemeriksaan ulang. Insiden ini tidak dibuka lagi.',
    en: 'The site stays on re-ignition watch. New reports near it raise a re-check alert. This incident is not reopened.',
  },
  cancel: { id: 'Batal', en: 'Cancel' },
  confirm: { id: 'Tandai padam', en: 'Mark extinguished' },
  saving: { id: 'Menyimpan…', en: 'Saving…' },
  done: { id: 'Ditandai padam oleh', en: 'Marked extinguished by' },
  doneAnon: { id: 'Ditandai padam', en: 'Marked extinguished' },
  at: { id: 'pukul', en: 'at' },
  audit: { id: 'audit', en: 'audit' },
  alreadyOut: {
    id: 'Insiden ini sudah ditandai padam. Tidak ada yang diubah lagi.',
    en: 'This incident is already marked extinguished. Nothing was changed again.',
  },
  errNetwork: {
    id: 'Tidak bisa menghubungi ember-api. Insiden belum ditandai padam. Periksa koneksi lalu coba lagi.',
    en: 'Could not reach ember-api. The incident was not marked extinguished. Check the connection and try again.',
  },
  errSession: {
    id: 'Sesi ini tidak boleh menandai insiden padam. Masuk lagi sebagai supervisor.',
    en: 'This session cannot mark an incident extinguished. Sign in again as a supervisor.',
  },
  errGone: { id: 'Insiden ini sudah tidak ada. Kembali ke daftar insiden.', en: 'This incident no longer exists. Go back to the incident list.' },
  errServer: {
    id: 'ember-api tidak bisa menyimpan perubahan dan belum ada konfirmasi. Periksa insiden, lalu coba lagi.',
    en: 'ember-api could not save the change and nothing was confirmed. Check the incident, then try again.',
  },
} as const

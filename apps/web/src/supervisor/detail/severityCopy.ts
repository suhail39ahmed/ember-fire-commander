/** Lower severity dialog labels. Bahasa is DRAFT and needs native-speaker review. */
export const severityCopy = {
  open: { id: 'Turunkan tingkat', en: 'Lower severity' },
  title: { id: 'Turunkan tingkat untuk', en: 'Lower severity for' },
  current: { id: 'SAAT INI', en: 'CURRENT' },
  option: {
    small_flame: { id: 'Api kecil — ada api kecil terlihat', en: 'Small flame — a small visible flame' },
    smoke: { id: 'Asap — tidak ada api terlihat', en: 'Smoke — no visible flame' },
    none: { id: 'Tidak ada — tidak ada yang terbakar', en: 'None — nothing burning' },
  },
  raiseNote: { id: 'Api besar tidak ditawarkan: hanya kode yang bisa menaikkan tingkat.', en: 'Large flame isn’t offered: only code can raise severity.' },
  raiseNoteTop: { id: 'Hanya kode yang bisa menaikkan tingkat.', en: 'Only code can raise severity.' },
  unknownNote: { id: 'Tidak diketahui tidak ditawarkan: tidak pernah menurunkan tingkat yang sudah diketahui.', en: 'Unknown isn’t offered: it never lowers a known severity.' },
  withdrawNote: { id: 'MUNDUR yang aktif tetap berlaku.', en: 'An active WITHDRAW stays in effect.' },
  nothing: { id: 'Tidak ada tingkat yang lebih rendah dari ini.', en: 'Nothing is lower than this.' },
  cancel: { id: 'Batal', en: 'Cancel' },
  confirm: { id: 'Turunkan ke', en: 'Lower to' },
  saving: { id: 'Menyimpan…', en: 'Saving…' },
  choose: { id: 'Pilih tingkat baru.', en: 'Choose the new severity.' },
  groupLabel: { id: 'Tingkat baru', en: 'New severity' },
  doneBy: { id: 'oleh', en: 'by' },
  done: { id: 'Tingkat diturunkan ke', en: 'Severity lowered to' },
  audit: { id: 'audit', en: 'audit' },
  errNetwork: {
    id: 'Tidak bisa menghubungi ember-api. Tingkat belum diubah. Periksa koneksi lalu coba lagi.',
    en: 'Could not reach ember-api. The severity was not changed. Check the connection and try again.',
  },
  errNotLower: {
    id: 'Tingkat insiden sudah berubah. Tidak ada yang diubah. Daftar sudah diperbarui, pilih lagi.',
    en: 'The incident’s severity has changed. Nothing was changed. The list is updated, choose again.',
  },
  errRefused: {
    id: 'Tingkat itu tidak diterima. Tidak ada yang diubah. Pilih tingkat lain.',
    en: 'That severity was not accepted. Nothing was changed. Choose another.',
  },
  errSession: {
    id: 'Sesi ini tidak boleh menurunkan tingkat. Masuk lagi sebagai supervisor.',
    en: 'This session cannot lower severity. Sign in again as a supervisor.',
  },
  errGone: { id: 'Insiden ini sudah tidak ada. Kembali ke daftar insiden.', en: 'This incident no longer exists. Go back to the incident list.' },
  errServer: {
    id: 'ember-api tidak bisa menyimpan perubahan dan belum ada konfirmasi. Periksa insiden, lalu coba lagi.',
    en: 'ember-api could not save the change and nothing was confirmed. Check the incident, then try again.',
  },
} as const

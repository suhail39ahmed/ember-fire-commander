/** Edit instruction dialog labels. Bahasa is DRAFT and needs native-speaker review. */
export const editCopy = {
  factType: { id: 'Jenis', en: 'Type' },
  factVolunteer: { id: 'Relawan', en: 'Volunteer' },
  factIncident: { id: 'Insiden', en: 'Incident' },
  titleFor: { id: 'Ubah instruksi', en: 'Edit' },
  /** English reads "Edit Dedi’s instruction"; Bahasa reads "Ubah instruksi Dedi". */
  titleSuffix: { id: '', en: '’s instruction' },
  field: { id: 'Instruksi yang ditampilkan dan dibacakan ke relawan', en: 'Instruction shown and spoken to the volunteer' },
  readOnly: { id: 'Tidak bisa diubah', en: 'Read-only' },
  note: {
    id: 'Jenis, relawan, dan insiden tidak berubah. Disimpan sebagai task.edit oleh',
    en: 'Type, volunteer and incident stay the same. Saved as task.edit by',
  },
  noteTail: { id: 'Menyetujui adalah langkah terpisah.', en: 'Approving is a separate step.' },
  noteNoName: {
    id: 'Jenis, relawan, dan insiden tidak berubah. Disimpan sebagai task.edit.',
    en: 'Type, volunteer and incident stay the same. Saved as task.edit.',
  },
  cancel: { id: 'Batal', en: 'Cancel' },
  save: { id: 'Simpan instruksi', en: 'Save instruction' },
  saving: { id: 'Menyimpan…', en: 'Saving…' },
  unchanged: { id: 'Ubah teksnya dulu.', en: 'Change the text first.' },
  saved: { id: 'Instruksi disimpan', en: 'Instruction saved' },
  by: { id: 'oleh', en: 'by' },
  audit: { id: 'audit', en: 'audit' },
  blank: { id: 'Tulis instruksinya. Teks lama tetap dipakai.', en: 'Write the instruction. The old text stays.' },
  tooLong: { id: 'Instruksi terlalu panjang. Maksimal 500 karakter. Teks lama tetap dipakai.', en: 'The instruction is too long. 500 characters at most. The old text stays.' },
  errNetwork: {
    id: 'Tidak bisa menghubungi ember-api. Instruksi belum diubah dan teks lama tetap dipakai. Periksa koneksi lalu coba lagi.',
    en: 'Could not reach ember-api. The instruction was not changed and the old text stays. Check the connection and try again.',
  },
  errWithdraw: {
    id: 'Ini instruksi MUNDUR. Instruksi ini dikirim oleh kode dan tidak bisa diubah. Teks lama tetap dipakai.',
    en: 'This is a WITHDRAW instruction. Code sends it and it can’t be edited. The old text stays.',
  },
  errRefused: {
    id: 'Instruksi ini tidak bisa diubah sekarang. Teks lama tetap dipakai. Tutup dialog, periksa tugasnya, lalu coba lagi.',
    en: 'This instruction can’t be edited now. The old text stays. Close this, check the task, then try again.',
  },
  errInvalid: {
    id: 'Instruksi tidak diterima. Tulis instruksi singkat (maksimal 500 karakter). Teks lama tetap dipakai.',
    en: 'The instruction was not accepted. Write a short instruction (500 characters at most). The old text stays.',
  },
  errSession: {
    id: 'Sesi ini tidak boleh mengubah instruksi. Masuk lagi sebagai supervisor. Teks lama tetap dipakai.',
    en: 'This session cannot edit instructions. Sign in again as a supervisor. The old text stays.',
  },
  errGone: {
    id: 'Tugas ini sudah tidak ada. Tutup dialog dan periksa insidennya.',
    en: 'This task no longer exists. Close this and check the incident.',
  },
  errServer: {
    id: 'ember-api tidak bisa menyimpan instruksi ini dan belum ada yang berubah. Teks lama tetap dipakai. Coba lagi.',
    en: 'ember-api could not save this instruction and nothing changed. The old text stays. Try again.',
  },
} as const

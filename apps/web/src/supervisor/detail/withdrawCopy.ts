/** Send WITHDRAW dialog labels. Bahasa is DRAFT and needs native-speaker review. */
export const withdrawCopy = {
  open: { id: 'Kirim mundur', en: 'Send withdraw' },
  title: { id: 'Kirim MUNDUR di', en: 'Send WITHDRAW at' },
  recipients: { id: 'Relawan di insiden ini', en: 'Volunteers on this incident' },
  instruction: { id: 'Instruksi', en: 'Instruction' },
  hint: {
    id: 'Tampil layar penuh dan dibacakan. Alasan tersimpan: supervisor instruction.',
    en: 'Shown full screen and spoken. Reason saved: supervisor instruction.',
  },
  cancel: { id: 'Batal', en: 'Cancel' },
  send: { id: 'Kirim MUNDUR ke', en: 'Send WITHDRAW to' },
  sending: { id: 'Mengirim…', en: 'Sending…' },
  reportsOne: { id: 'laporan', en: 'report' },
  reportsMany: { id: 'laporan', en: 'reports' },
  taskOnly: { id: 'tugas', en: 'task' },
  alreadyWithdrawn: { id: 'Sudah dapat MUNDUR', en: 'Already on WITHDRAW' },
  noRecipients: { id: 'Belum ada relawan di insiden ini.', en: 'No volunteers on this incident yet.' },
  noneSelected: { id: 'Pilih setidaknya satu relawan.', en: 'Choose at least one volunteer.' },
  blank: { id: 'Tulis instruksi MUNDUR.', en: 'Write the WITHDRAW instruction.' },
  tooLong: { id: 'Instruksi terlalu panjang. Maksimal 500 karakter.', en: 'The instruction is too long. 500 characters at most.' },
  sentOne: { id: 'MUNDUR terkirim ke 1 relawan', en: 'WITHDRAW sent to 1 volunteer' },
  sentMany: { id: 'MUNDUR terkirim ke', en: 'WITHDRAW sent to' },
  sentManyUnit: { id: 'relawan', en: 'volunteers' },
  audit: { id: 'audit', en: 'audit' },
  errNetwork: {
    id: 'Tidak bisa menghubungi ember-api. MUNDUR belum terkirim. Periksa koneksi lalu coba lagi.',
    en: 'Could not reach ember-api. WITHDRAW was not sent. Check the connection and try again.',
  },
  errUnknownVolunteer: {
    id: 'Salah satu relawan yang dipilih tidak ada di insiden ini lagi. Tidak ada yang diubah. Tutup dialog, periksa daftarnya, lalu pilih lagi.',
    en: 'One of the selected volunteers is no longer on this incident. Nothing was changed. Close this, check the list, and choose again.',
  },
  errInstruction: {
    id: 'Instruksi tidak diterima. Tulis instruksi singkat (maksimal 500 karakter).',
    en: 'The instruction was not accepted. Write a short instruction (500 characters at most).',
  },
  errSession: {
    id: 'Sesi ini tidak boleh mengirim MUNDUR. Masuk lagi sebagai supervisor.',
    en: 'This session cannot send WITHDRAW. Sign in again as a supervisor.',
  },
  errGone: {
    id: 'Insiden ini sudah tidak ada. Kembali ke daftar insiden.',
    en: 'This incident no longer exists. Go back to the incident list.',
  },
  errServer: {
    id: 'ember-api tidak bisa memproses MUNDUR dan belum ada konfirmasi. Periksa insiden, lalu coba lagi.',
    en: 'ember-api could not process the WITHDRAW and nothing was confirmed. Check the incident, then try again.',
  },
} as const

/** The two lines of the default instruction, as the frame shows them in ID and EN. */
export const DEFAULT_WITHDRAW = {
  id: 'Mundur ke arah datangnya angin. Jangan lawan api.',
  en: 'Withdraw upwind. Do not engage.',
} as const

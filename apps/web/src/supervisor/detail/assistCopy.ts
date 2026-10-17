/** Labels for the model-written help: suggestions, Ask EMBER and English translations. Bahasa is DRAFT and needs native-speaker review. */
export const assistCopy = {
  title: { id: 'SARAN AI', en: 'AI SUGGESTED' },
  titleRules: { id: 'SARAN', en: 'SUGGESTIONS' },
  make: { id: 'Buat saran AI', en: 'Make AI suggestions' },
  refresh: { id: 'Perbarui saran AI', en: 'Refresh AI suggestions' },
  working: { id: 'Menyusun…', en: 'Working…' },
  none: { id: 'Belum ada saran untuk insiden ini.', en: 'No suggestions have been made for this incident yet.' },
  empty: { id: 'Data tersimpan belum cukup untuk saran.', en: 'The stored data does not support a suggestion yet.' },
  why: { id: 'Alasan', en: 'Why' },
  madeAt: { id: 'Dibuat', en: 'Made' },
  fromModel: { id: 'dari AI', en: 'from AI' },
  fromRules: { id: 'daftar aturan sederhana, model tidak tersedia', en: 'simple rule list, the model was not available' },
  decide: {
    id: 'Untuk mengirim, tulis instruksi di jendela relawan. Saran ini tidak mengirim apa pun.',
    en: 'To send something, write the instruction in the volunteer window. A suggestion sends nothing.',
  },

  askNote: { id: 'dijawab AI dari data tersimpan', en: 'answered by AI from stored data' },
  askBtn: { id: 'Tanya', en: 'Ask' },
  asking: { id: 'Menjawab…', en: 'Answering…' },
  askLabel: { id: 'Pertanyaan untuk EMBER AI', en: 'Question for EMBER AI' },
  askPlaceholder: { id: 'Tanya EMBER AI tentang relawan ini…', en: 'Ask EMBER AI about this volunteer…' },
  askLimit: { id: 'karakter tersisa', en: 'characters left' },
  answer: { id: 'Jawaban AI', en: 'AI answer' },
  notEnough: { id: 'Data tersimpan tidak cukup untuk menjawab penuh.', en: 'The stored data is not enough for a full answer.' },
  askRule: {
    id: 'Jawaban hanya teks saran. Tidak ada yang dikirim, dan tingkat insiden tidak berubah.',
    en: 'An answer is advice text only. Nothing is sent and the incident severity does not change.',
  },

  translate: { id: 'Terjemahan AI ke bahasa Inggris', en: 'AI translate to English' },
  translating: { id: 'Menerjemahkan…', en: 'Translating…' },
  english: { id: 'Terjemahan AI', en: 'AI translation' },
  translatedFrom: { id: 'dari', en: 'from' },

  errUnavailable: { id: 'Layanan agents atau model sedang tidak tersedia. Tidak ada yang tersimpan. Coba lagi nanti.', en: 'The agents service or the model is not available. Nothing was stored. Try again later.' },
  errSession: { id: 'Sesi ini bukan supervisor. Masuk lagi.', en: 'This session is not a supervisor. Sign in again.' },
  errGone: { id: 'Insiden atau laporan ini sudah tidak ada.', en: 'This incident or report no longer exists.' },
  errInvalid: { id: 'Pertanyaan tidak valid.', en: 'The question is not valid.' },
  errNetwork: { id: 'Tidak bisa menghubungi ember-api. Periksa koneksi lalu coba lagi.', en: 'Could not reach ember-api. Check the connection and try again.' },
} as const

/** The ISO 639-1 codes the console names. Any other code is shown as is, and `und` as unknown. */
export const languageNames: Record<string, { id: string; en: string }> = {
  id: { id: 'Indonesia', en: 'Indonesian' },
  en: { id: 'Inggris', en: 'English' },
  jv: { id: 'Jawa', en: 'Javanese' },
  ms: { id: 'Melayu', en: 'Malay' },
  und: { id: 'tidak diketahui', en: 'unknown' },
}

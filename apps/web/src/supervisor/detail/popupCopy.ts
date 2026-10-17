/** Volunteer pop-up labels. Bahasa is DRAFT and needs native-speaker review. */
export const popupCopy = {
  open: { id: 'Buka', en: 'Open' },
  close: { id: 'Tutup', en: 'Close' },
  gone: {
    id: 'Relawan ini tidak ada lagi di insiden ini. Tutup dan pilih relawan lain.',
    en: 'This volunteer is no longer on this incident. Close this and choose another.',
  },
  notYet: { id: 'Belum tersedia', en: 'Not available yet' },
  needs: { id: 'Perlu', en: 'Needs' },

  video: { id: 'Video langsung', en: 'Live video' },
  liveOff: { id: 'TIDAK LANGSUNG', en: 'NOT LIVE' },
  videoBody: {
    id: 'Video langsung relawan belum sampai ke konsol.',
    en: 'This volunteer’s live video does not reach the console yet.',
  },
  mic: { id: 'Mik', en: 'Mic' },
  videoBtn: { id: 'Video', en: 'Video' },
  snapshot: { id: 'Foto', en: 'Snapshot' },
  flip: { id: 'Balik kamera', en: 'Flip camera' },
  endLive: { id: 'Akhiri live', en: 'End live' },

  transcript: { id: 'Transkrip', en: 'Transcript' },
  transcriptNote: { id: 'Laporan relawan ini, bahasa aslinya', en: 'This volunteer’s reports, in the original language' },
  noReports: { id: 'Relawan ini belum mengirim laporan.', en: 'This volunteer has not sent a report yet.' },
  translation: {
    id: 'Terjemahan bahasa Inggris belum disimpan oleh ember-api, jadi tidak ditampilkan.',
    en: 'ember-api does not store an English translation yet, so none is shown.',
  },
  noText: { id: 'Tanpa teks', en: 'No text' },
  photoReport: { id: 'Laporan foto', en: 'Photo report' },

  snapshots: { id: 'Foto tersimpan di insiden', en: 'Snapshots saved to the incident' },
  noSnapshots: { id: 'Belum ada foto dari relawan ini.', en: 'No photos from this volunteer yet.' },
  sent: { id: 'Dikirim ke', en: 'Sent to' },
  noInstructions: { id: 'Belum ada instruksi untuk relawan ini.', en: 'No instructions for this volunteer yet.' },
  profile: { id: 'Profil', en: 'Profile' },
  role: { id: 'Peran', en: 'Role' },
  incident: { id: 'Insiden', en: 'Incident' },
  position: { id: 'Posisi', en: 'Position' },
  distance: { id: 'Jarak', en: 'Distance' },
  firstReport: { id: 'Laporan pertama', en: 'First report' },
  lastReport: { id: 'Laporan terakhir', en: 'Last report' },
  reports: { id: 'Laporan', en: 'Reports' },
  network: { id: 'Jaringan', en: 'Network' },
  battery: { id: 'Baterai', en: 'Battery' },
  language: { id: 'Bahasa', en: 'Language' },
  lastHeard: { id: 'Terakhir terdengar', en: 'Last heard' },
  suggestions: { id: 'Saran AI', en: 'AI suggested' },
  ask: { id: 'Tanya EMBER AI tentang', en: 'Ask EMBER AI about' },
  askBefore: { id: 'MINTA SEBELUM DIKIRIM', en: 'ASKS BEFORE IT SENDS' },
  promptNext: { id: 'Apa selanjutnya?', en: 'What next?' },
  promptRecap: { id: 'Ringkas 5 menit terakhir', en: 'Summarise last 5 min' },
  promptAll: { id: 'Buat draf untuk semua', en: 'Draft for everyone' },
  askPlaceholder: { id: 'Tanya EMBER AI, atau tulis instruksi…', en: 'Ask EMBER AI, or tell it what to send…' },
  askGap: {
    id: 'Layanan agents belum punya endpoint yang menjawab pertanyaan, jadi obrolan ini belum tersambung. Tidak ada yang dikirim dari sini.',
    en: 'The agents service has no endpoint that answers questions, so this chat is not connected. Nothing is sent from here.',
  },

  send: { id: 'Kirim ke relawan ini', en: 'Send to this volunteer' },
  sendAll: { id: 'Kirim juga ke semua di lokasi', en: 'Also send to everyone on site' },
  sendBtn: { id: 'Kirim', en: 'Send' },
  withdrawRule: {
    id: 'MUNDUR tidak menunggu obrolan ini dan tidak bisa ditahan dari sini.',
    en: 'WITHDRAW never waits on this chat and cannot be blocked here.',
  },
  withdrawn: { id: 'MUNDUR terkirim', en: 'WITHDRAW sent' },
} as const

/** What each missing region needs from the backend, for the one line under it. */
export const popupNeeds = {
  video: { id: 'streaming video dari voice-gateway ke konsol (piksel video)', en: 'streaming video pixels from voice-gateway to the console' },
  ask: { id: 'endpoint di agents yang menjawab pertanyaan, plus utas dan draf instruksi', en: 'an endpoint in agents that answers questions, plus a thread and instruction drafts' },
} as const

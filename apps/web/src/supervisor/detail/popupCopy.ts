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
  snapshotsGap: {
    id: 'Gambar bersifat pribadi dan belum ada rute baca bertanda tangan, jadi hanya waktu dan relawan yang tampil.',
    en: 'Images are private and there is no signed read route yet, so only the time and the volunteer show.',
  },

  sent: { id: 'Dikirim ke', en: 'Sent to' },
  noInstructions: { id: 'Belum ada instruksi untuk relawan ini.', en: 'No instructions for this volunteer yet.' },
  heardGap: {
    id: 'Waktu kirim dan status didengar belum disimpan, jadi hanya teks dan status persetujuan yang tampil.',
    en: 'Send time and heard status are not stored yet, so only the text and the approval status show.',
  },

  profile: { id: 'Profil', en: 'Profile' },
  role: { id: 'Peran', en: 'Role' },
  incident: { id: 'Insiden', en: 'Incident' },
  position: { id: 'Posisi', en: 'Position' },
  firstReport: { id: 'Laporan pertama', en: 'First report' },
  lastReport: { id: 'Laporan terakhir', en: 'Last report' },
  reports: { id: 'Laporan', en: 'Reports' },
  network: { id: 'Jaringan', en: 'Network' },
  battery: { id: 'Baterai', en: 'Battery' },
  language: { id: 'Bahasa', en: 'Language' },
  lastHeard: { id: 'Terakhir terdengar', en: 'Last heard' },
  profileGap: {
    id: 'Peran, jaringan, baterai, bahasa, dan waktu terakhir terdengar belum dikirim ember-api.',
    en: 'Role, network, battery, language and last heard are not sent by ember-api yet.',
  },

  suggestions: { id: 'Saran EMBER', en: 'EMBER suggests' },
  suggestionsGap: {
    id: 'Saran dan alasannya belum dibuat oleh layanan mana pun. Model tidak pernah menentukan tingkat insiden.',
    en: 'No service writes suggestions with a rationale yet. The model never sets incident severity.',
  },

  ask: { id: 'Tanya EMBER tentang', en: 'Ask EMBER about' },
  askBefore: { id: 'MINTA SEBELUM DIKIRIM', en: 'ASKS BEFORE IT SENDS' },
  askPlaceholder: { id: 'Tanya EMBER, atau tulis instruksi…', en: 'Ask EMBER, or tell it what to send…' },
  askGap: {
    id: 'Percakapan dengan EMBER, draf instruksi, dan hasil kirim belum ada di ember-api. Tidak ada yang dikirim dari sini.',
    en: 'The EMBER chat, the instruction drafts and the send result are not in ember-api yet. Nothing is sent from here.',
  },

  send: { id: 'Kirim ke relawan ini', en: 'Send to this volunteer' },
  sendAll: { id: 'Kirim juga ke semua di lokasi', en: 'Also send to everyone on site' },
  sendBtn: { id: 'Kirim', en: 'Send' },
  sendGap: {
    id: 'Belum ada rute untuk mengirim instruksi bebas ke satu relawan. Hanya MUNDUR yang bisa dikirim, dari insiden.',
    en: 'There is no route to send a free instruction to one volunteer yet. Only WITHDRAW can be sent, from the incident.',
  },
  withdrawRule: {
    id: 'MUNDUR tidak menunggu obrolan ini dan tidak bisa ditahan dari sini.',
    en: 'WITHDRAW never waits on this chat and cannot be blocked here.',
  },
  withdrawn: { id: 'MUNDUR terkirim', en: 'WITHDRAW sent' },
} as const

/** What each missing region needs from the backend, for the one line under it. */
export const popupNeeds = {
  video: { id: 'streaming video dari voice-gateway ke konsol (piksel video)', en: 'streaming video pixels from voice-gateway to the console' },
  suggestions: { id: 'saran dengan alasan dari agents', en: 'suggestions with a rationale from agents' },
  ask: { id: 'utas Tanya EMBER, draf, dan kirim terkonfirmasi', en: 'an Ask EMBER thread, drafts, and a confirmed send' },
  send: { id: 'rute kirim instruksi ke satu relawan, dengan audit', en: 'a route that sends an instruction to one volunteer, with an audit entry' },
} as const

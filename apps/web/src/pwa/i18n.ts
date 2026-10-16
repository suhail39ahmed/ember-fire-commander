/**
 * UI strings. Bahasa Indonesia is the default; English is a toggle.
 * Bahasa copy is DRAFT and needs native-speaker review before the demo.
 * Chip labels live in report/chips.ts. Only the labels change with the language; the values sent to the API do not.
 */
/** Every language the UI can show. A new language is one more entry here and one more string per copy bundle. */
export const LANGUAGES = [
  { code: 'id', short: 'ID', name: 'Bahasa Indonesia' },
  { code: 'en', short: 'EN', name: 'English' },
] as const

export type Lang = (typeof LANGUAGES)[number]['code']

export const LANG_KEY = 'ember.lang'
export const DEFAULT_LANG: Lang = 'id'

/** Reads a stored language code; anything unknown falls back to the default. */
export function parseLang(value: string | null | undefined): Lang {
  return LANGUAGES.find((language) => language.code === value)?.code ?? DEFAULT_LANG
}

const strings = {
  simulated: { id: 'SIMULASI · data sintetis', en: 'SIMULATED · synthetic data' },
  team: { id: 'Regu A · Desa (fiktif)', en: 'Crew A · Village (fictional)' },
  loading: { id: 'Memuat tugas…', en: 'Loading your tasks…' },
  loadError: { id: 'Tidak bisa terhubung ke EMBER.', en: 'Could not reach EMBER.' },
  loadRefused: {
    id: 'EMBER menolak akses ini. Coba lagi; jika tetap gagal, masuk ulang atau hubungi supervisor.',
    en: 'EMBER refused this request. Try again; if it keeps failing, sign in again or contact your supervisor.',
  },
  retry: { id: 'Coba lagi', en: 'Try again' },
  noTask: { id: 'Belum ada tugas', en: 'No tasks right now' },
  noTaskHint: {
    id: 'Anda akan diberi tahu saat ada titik panas di dekat Anda yang perlu diperiksa.',
    en: "You'll be told when a hotspot near you needs checking.",
  },
  currentTask: { id: 'TUGAS SAAT INI', en: 'CURRENT TASK' },
  taskType: {
    verify: { id: 'Periksa', en: 'Verify' },
    withdraw: { id: 'Mundur', en: 'Withdraw' },
    investigate: { id: 'Selidiki', en: 'Investigate' },
    instruct: { id: 'Instruksi', en: 'Instruction' },
  },
  taskStatus: {
    proposed: { id: 'menunggu persetujuan supervisor', en: 'awaiting supervisor approval' },
    approved: { id: 'disetujui supervisor', en: 'approved by supervisor' },
    rejected: { id: 'ditolak supervisor', en: 'rejected by supervisor' },
  },
  safeTip: { id: 'Periksa dari jarak aman. Jangan masuk ke asap.', en: 'Check from a safe distance. Do not walk into smoke.' },
  sendAsReport: { id: 'Kirim sebagai laporan', en: 'Send as report' },
  notAFire: { id: 'Bukan kebakaran', en: 'Not a fire' },
  holdToTalk: { id: 'Tahan untuk bicara', en: 'Hold to talk' },
  talkUnavailable: { id: 'Suara belum tersedia. Pakai tombol cepat di bawah.', en: 'Voice is unavailable. Use the quick report below.' },
  talkNeedsSignIn: { id: 'Masuk dulu untuk bicara.', en: 'Sign in to talk.' },
  session: {
    idle: { id: 'Siap', en: 'Ready' },
    connecting: { id: 'Menghubungkan…', en: 'Connecting…' },
    live: { id: '● LIVE · tekan terus', en: '● LIVE · keep holding' },
    waiting: { id: 'Menunggu jawaban…', en: 'Waiting for reply…' },
    lost: { id: 'Koneksi terputus. Mundur tetap berfungsi.', en: 'Connection lost. Withdraw still works.' },
  },
  camera: { id: 'Kamera', en: 'Camera' },
  microphone: { id: 'Mikrofon', en: 'Microphone' },
  location: { id: 'Lokasi', en: 'Location' },
  notifications: { id: 'Notifikasi', en: 'Notifications' },
  permissionsTitle: { id: 'IZIN APLIKASI', en: 'APP PERMISSIONS' },
  perm: {
    granted: { id: 'diizinkan', en: 'allowed' },
    prompt: { id: 'belum diminta', en: 'not asked yet' },
    denied: { id: 'ditolak', en: 'denied' },
    unsupported: { id: 'tidak didukung', en: 'not supported' },
  },
  permDeniedHelp: {
    id: 'Ditolak. Buka pengaturan browser/ponsel untuk mengizinkan.',
    en: 'Denied. Open your browser or phone settings to allow it.',
  },
  allow: { id: 'Izinkan', en: 'Allow' },
  pushUnavailable: {
    id: 'Notifikasi tidak tersedia. EMBER tetap memeriksa tugas saat aplikasi terbuka.',
    en: 'Push is unavailable. EMBER still checks for tasks while the app is open.',
  },
  install: { id: 'Pasang EMBER', en: 'Install EMBER' },
  installIos: {
    id: 'Di iPhone: Bagikan → Tambahkan ke Layar Utama, lalu buka dari sana.',
    en: 'On iPhone: Share → Add to Home Screen, then open it from there.',
  },
  quickReport: { id: 'LAPORAN CEPAT', en: 'QUICK REPORT' },
  noteLabel: { id: 'CATATAN (OPSIONAL)', en: 'NOTE (OPTIONAL)' },
  notePlaceholder: { id: 'Tulis catatan singkat', en: 'Add a short note' },
  sendReport: { id: 'Kirim laporan', en: 'Send report' },
  sending: { id: 'Mengirim…', en: 'Sending…' },
  sent: { id: 'Laporan terkirim ✓', en: 'Report sent ✓' },
  sentDetail: { id: 'Supervisor Anda bisa melihatnya sekarang.', en: 'Your supervisor can see it now.' },
  sentSummary: { id: 'Yang Anda kirim', en: 'What you sent' },
  newReport: { id: 'Laporan baru', en: 'New report' },
  errEmpty: {
    id: 'Pilih salah satu: asap, api, aman atau butuh bantuan — atau tulis catatan.',
    en: 'Choose Smoke, Fire, Safe or Need help — or write a note.',
  },
  errTooLong: { id: 'Catatan terlalu panjang.', en: 'Note is too long.' },
  errNetwork: { id: 'Gagal mengirim. Periksa sinyal lalu coba lagi.', en: 'Could not send. Check signal and try again.' },
  errApi: { id: 'Laporan ditolak oleh server:', en: 'The server rejected the report:' },
  locating: {
    id: 'Mengambil lokasi… jawab permintaan izin di browser jika muncul.',
    en: 'Getting location… answer the browser prompt if one appears.',
  },
  waitingForLocation: { id: 'Menunggu lokasi…', en: 'Waiting for location…' },
  sendHint: { id: 'Pilih satu isyarat atau tulis catatan untuk mengirim.', en: 'Pick a chip or write a note to send.' },
  locationNote: { id: 'Lokasi Anda dilampirkan saat laporan dikirim.', en: 'Your location is attached when you send.' },
  locationBlocked: {
    id: 'Lokasi diblokir. Izinkan di pengaturan situs, lalu ketuk Kirim.',
    en: 'Location is blocked. Allow it in site settings, then tap Send.',
  },
  noLocation: { id: 'Lokasi tidak tersedia. Nyalakan lokasi lalu kirim lagi.', en: 'Location unavailable. Turn on location and send again.' },
  withdrawLabel: { id: 'ATURAN KESELAMATAN · TETAP', en: 'SAFETY RULE · FIXED' },
  withdrawTitle: { id: 'MUNDUR SEKARANG', en: 'WITHDRAW NOW' },
  withdrawWhy: {
    id: 'Dikirim otomatis oleh aturan keselamatan, tanpa menunggu persetujuan. Asisten suara tidak bisa mengubah instruksi ini.',
    en: 'Sent automatically by a safety rule, with no approval wait. The voice assistant cannot change this instruction.',
  },
  withdrawAck: { id: 'Saya aman', en: "I'm safe" },
  withdrawAcked: { id: 'Tercatat. Tetap di tempat aman.', en: 'Noted. Stay somewhere safe.' },
} as const

type Leaf = { id: string; en: string }
export type Strings = typeof strings

export function t(lang: Lang, leaf: Leaf): string {
  return leaf[lang]
}

export { strings }

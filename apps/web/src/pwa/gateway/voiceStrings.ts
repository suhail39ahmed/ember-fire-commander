/** Push-to-talk copy (#74). Bahasa Indonesia default; DRAFT, needs native-speaker review. */
export const voiceStrings = {
  button: {
    checking: { id: 'Memeriksa suara…', en: 'Checking voice…' },
    ready: { id: 'Tahan untuk bicara', en: 'Hold to talk' },
    connecting: { id: 'Menghubungkan…', en: 'Connecting…' },
    listening: { id: 'Mendengarkan · lepas untuk kirim', en: 'Listening · release to send' },
    replying: { id: 'Coach sedang menjawab…', en: 'Coach is replying…' },
    unavailable: { id: 'Suara tidak tersedia · pakai laporan cepat', en: 'Voice unavailable · use quick report' },
  },
  status: {
    checking: { id: 'Memeriksa layanan suara…', en: 'Checking the voice service…' },
    ready: { id: 'Suara siap · tahan dan bicara dalam Bahasa atau Inggris', en: 'Voice ready · hold and speak Bahasa or English' },
    connecting: { id: 'Menghubungkan…', en: 'Connecting…' },
    listening: { id: '● LIVE · tekan terus', en: '● LIVE · keep holding' },
    replying: { id: 'Menunggu jawaban…', en: 'Waiting for reply…' },
    lost: { id: 'Koneksi terputus. Mundur tetap berfungsi.', en: 'Connection lost. Withdraw still works.' },
    down: { id: 'Layanan suara mati · chip dan catatan tetap terkirim', en: 'Voice service is down · chips and notes still send' },
    signedOut: { id: 'Masuk dulu untuk bicara.', en: 'Sign in to talk.' },
    micBlocked: {
      id: 'Mikrofon diblokir · Pengaturan situs → Mikrofon → Izinkan',
      en: 'Microphone is blocked · Site settings → Microphone → Allow',
    },
  },
} as const

export type VoiceLeaf = { readonly id: string; readonly en: string }

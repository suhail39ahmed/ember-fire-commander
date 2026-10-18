/** Send one instruction to one volunteer, and what the pop-up says about suggestions, photos and profile. Bahasa is DRAFT and needs native-speaker review. */
export const instructionCopy = {
  placeholder: { id: 'Tulis satu instruksi untuk relawan ini…', en: 'Write one instruction for this volunteer…' },
  label: { id: 'Instruksi', en: 'Instruction' },
  sending: { id: 'Mengirim…', en: 'Sending…' },
  sentTo: { id: 'Terkirim ke', en: 'Sent to' },
  logged: { id: 'tercatat', en: 'logged' },
  left: { id: 'karakter tersisa', en: 'characters left' },
  onlyOne: {
    id: 'Satu relawan per pengiriman. Mengirim ke semua di lokasi belum ada rutenya.',
    en: 'One volunteer per send. There is no route that sends to everyone on site yet.',
  },
  blocked: {
    offline: { id: 'Offline · tidak bisa kirim.', en: 'Offline · can’t send.' },
    extinguished: { id: 'Insiden ini sudah padam, jadi tidak menerima instruksi baru.', en: 'This incident is extinguished, so it takes no new instruction.' },
    withdraw: {
      id: 'MUNDUR berlaku untuk relawan ini dan belum ditandai aman. Instruksi bebas tidak bisa menahan atau menggantikannya.',
      en: 'WITHDRAW is in force for this volunteer and they are not marked safe. A free instruction cannot hold or replace it.',
    },
  },
  problem: {
    blank: { id: 'Tulis instruksinya dulu.', en: 'Write the instruction first.' },
    too_long: { id: 'Instruksi terlalu panjang. Maksimal 500 karakter.', en: 'The instruction is too long. At most 500 characters.' },
  },
  errNetwork: { id: 'Tidak bisa menghubungi ember-api, jadi belum terkirim. Periksa koneksi lalu coba lagi.', en: 'Could not reach ember-api, so nothing was sent. Check the connection and try again.' },
  errSession: { id: 'Sesi ini tidak boleh mengirim instruksi. Masuk lagi sebagai supervisor.', en: 'This session cannot send instructions. Sign in again as a supervisor.' },
  errRefused: { id: 'Instruksi ditolak: MUNDUR berlaku untuk relawan ini, atau insiden sudah padam. Layar diperbarui.', en: 'Refused: WITHDRAW is in force for this volunteer, or the incident is extinguished. The screen is updated.' },
  errInvalid: { id: 'Instruksi atau relawan tidak valid. Tidak ada yang terkirim.', en: 'The instruction or the volunteer is not valid. Nothing was sent.' },
  errGone: { id: 'Insiden ini sudah tidak ada.', en: 'This incident no longer exists.' },
  errServer: { id: 'ember-api tidak bisa mengirim ini dan belum ada yang berubah. Coba lagi.', en: 'ember-api could not send this and nothing changed. Try again.' },
} as const

export const suggestCopy = {
  none: { id: 'Tidak ada usulan yang menunggu untuk relawan ini.', en: 'No suggestion is waiting for this volunteer.' },
  reasonConflict: { id: 'Alasan: laporan di insiden ini berbeda.', en: 'Why: the reports on this incident disagree.' },
  reasonNone: { id: 'Alasan tidak dicatat.', en: 'No reason was recorded.' },
  decideInList: { id: 'Setujui, ubah, atau tolak di daftar Instruksi insiden.', en: 'Approve, edit or reject it in the incident’s Instructions list.' },
  factors: { id: 'Dasar skor bukti insiden', en: 'What the incident’s evidence score rests on' },
  limit: {
    id: 'EMBER hanya mengusulkan tugas periksa saat laporan berbeda. Saran bebas dengan alasan belum dibuat layanan mana pun.',
    en: 'EMBER only proposes a verify task when reports disagree. No service writes free-form advice with a rationale.',
  },
  limitWithModel: {
    id: 'Tugas periksa diusulkan saat laporan berbeda. Saran bebas dengan alasan ada di halaman insiden.',
    en: 'A verify task is proposed when reports disagree. Free suggestions with a reason are on the incident page.',
  },
} as const

export const photoCopy = {
  loading: { id: 'Memuat foto…', en: 'Loading photo…' },
  failed: { id: 'Foto tidak bisa dibaca sekarang.', en: 'The photo cannot be read right now.' },
  alt: { id: 'Foto dari relawan', en: 'Photo from the volunteer' },
  open: { id: 'Buka foto lebih besar', en: 'Open photo larger' },
  note: {
    id: 'Foto dibuka lewat tautan baca singkat yang hanya bisa dibuat supervisor.',
    en: 'Photos open through a short-lived read link that only a supervisor can request.',
  },
} as const

export const profileCopy = {
  device: { id: 'Perangkat', en: 'Device' },
  deviceYes: { id: 'Token notifikasi tersimpan', en: 'Push token stored' },
  deviceNo: { id: 'Belum ada token notifikasi', en: 'No push token stored' },
  crew: { id: 'Regu', en: 'Crew' },
  deviceNote: {
    id: 'Jaringan, baterai, dan bahasa berasal dari laporan terbaru ponsel yang memuatnya, bukan bacaan langsung.',
    en: 'Network, battery and language come from the phone’s newest report that carried them, not a live reading.',
  },
  deviceNone: {
    id: 'Belum ada laporan relawan ini yang memuat jaringan, baterai, atau bahasa.',
    en: 'No report from this volunteer has carried network, battery or language yet.',
  },
  roleNone: { id: 'Peran di tim muncul setelah relawan bergabung dengan peran.', en: 'A team role shows once the volunteer has joined with one.' },
  languageName: { id: { id: 'Bahasa Indonesia', en: 'Indonesian' }, en: { id: 'Bahasa Inggris', en: 'English' } },
} as const

/** What the instruction history says about the volunteer's answer. Bahasa is DRAFT. */
export const answerCopy = {
  accepted: { id: 'Sedang dikerjakan', en: 'Doing it' },
  declined: { id: 'Ditolak', en: 'Declined' },
} as const

/** What the advisory photo read says under a snapshot. Bahasa is DRAFT. It describes the picture and states no severity. */
export const visionCopy = {
  title: { id: 'Cek foto AI', en: 'AI photo check' },
  note: { id: 'Menggambarkan foto, bukan tingkat insiden.', en: 'Describes the picture, not the incident severity.' },
  smoke: { id: 'asap terlihat', en: 'smoke visible' },
  noSmoke: { id: 'tidak ada asap', en: 'no smoke' },
  burnScar: { id: 'bekas terbakar terlihat', en: 'burn scar visible' },
  flame: {
    none: { id: 'tidak ada api', en: 'no flame' },
    small: { id: 'api kecil', en: 'small flame' },
    large: { id: 'api besar', en: 'large flame' },
    unclear: { id: 'api tidak jelas', en: 'flame unclear' },
  },
} as const

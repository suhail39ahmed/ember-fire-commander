/**
 * Incident detail labels. Bahasa is DRAFT and needs native-speaker review, like chromeCopy.ts.
 * Only fixed words live here. Names, times, counts and instructions come from ember-api.
 */
import type { IncidentStatus, Severity } from '../contracts'
import type { TaskStatus } from '../../pwa/contracts/types'

export const detailCopy = {
  crumbIncidents: { id: 'Insiden', en: 'Incidents' },
  back: { id: 'Kembali ke insiden', en: 'Back to incidents' },
  loading: { id: 'Memuat', en: 'Loading' },
  onSite: { id: 'di lokasi', en: 'on site' },
  lastKnown: { id: 'TERAKHIR DIKETAHUI', en: 'LAST KNOWN' },
  withdrawPill: { id: 'MUNDUR', en: 'WITHDRAW' },
  holdPill: { id: 'DISPATCH DITAHAN', en: 'DISPATCH ON HOLD' },
  actions: { id: 'Tindakan insiden', en: 'Incident actions' },
  verify: { id: 'Verifikasi insiden', en: 'Verify incident' },
  auditLog: { id: 'Log audit', en: 'Audit log' },
  offlineSend: { id: 'Offline · tidak bisa kirim', en: 'Offline · can’t send' },

  statSeverity: { id: 'TINGKAT', en: 'SEVERITY' },
  statSeverityRule: { id: 'Laporan tertinggi menang', en: 'Highest report wins' },
  statEvidence: { id: 'BUKTI', en: 'EVIDENCE' },
  statEvidenceNote: { id: 'Dihitung dari laporan. Bukan probabilitas.', en: 'Computed from the reports. Not a probability.' },
  statReports: { id: 'LAPORAN', en: 'REPORTS' },
  statPosition: { id: 'POSISI', en: 'POSITION' },
  statPositionNote: { id: 'Titik tengah laporan', en: 'Centre of the reports' },

  fieldTitle: { id: 'Langsung dari lapangan', en: 'Live from the field' },
  fieldNote: { id: 'laporan terbaru dari tiap relawan', en: 'latest report from each volunteer' },
  fieldEmpty: { id: 'Belum ada relawan di insiden ini.', en: 'No volunteers on this incident yet.' },
  lastReport: { id: 'Laporan terakhir', en: 'Last report' },
  noReportText: { id: 'Tanpa catatan.', en: 'No note.' },
  photoReport: { id: 'Laporan foto', en: 'Photo report' },
  noReport: { id: 'Belum ada laporan dari relawan ini.', en: 'No report from this volunteer yet.' },
  lastInstruction: { id: 'Instruksi terakhir', en: 'Last instruction' },
  noInstruction: { id: 'Belum ada instruksi.', en: 'No instruction yet.' },
  withdrawSent: { id: 'MUNDUR terkirim', en: 'WITHDRAW sent' },
  source: {
    chip: { id: 'tombol cepat', en: 'quick chip' },
    text: { id: 'teks', en: 'text' },
    photo: { id: 'foto', en: 'photo' },
    live: { id: 'suara langsung', en: 'live voice' },
  },

  conflictTitle: { id: 'Laporan berbeda', en: 'Reports disagree' },
  conflictBody: { id: 'Kedua laporan disimpan berdampingan. Tidak ada yang dirata-rata.', en: 'Both reports are kept side by side. Nothing is averaged.' },
  conflictHigher: { id: 'Insiden memakai tingkat yang lebih tinggi', en: 'The incident keeps the higher severity' },
  conflictResolved: { id: 'KONFLIK SELESAI', en: 'CONFLICT RESOLVED' },
  conflictOpen: { id: 'EMBER TIDAK YAKIN', en: 'EMBER IS NOT SURE' },

  instructionsTitle: { id: 'Instruksi untuk semua di lokasi', en: 'Instructions to everyone on site' },
  instructionsNote: { id: 'usulan EMBER · perlu persetujuan', en: 'proposed by EMBER · needs approval' },
  tasksEmpty: { id: 'Belum ada usulan tugas.', en: 'No proposed tasks yet.' },
  withdrawRule: {
    id: 'MUNDUR bukan instruksi biasa. Kode mengirimnya saat asap atau angin menjadi berbahaya, tanpa persetujuan.',
    en: 'WITHDRAW is not an instruction here. Code sends it the moment smoke or wind turns dangerous — no approval needed.',
  },

  timeline: { id: 'Linimasa', en: 'Timeline' },
  timelineEmpty: { id: 'Belum ada laporan.', en: 'No reports yet.' },
  timelineNote: { id: 'Dari laporan relawan', en: 'From volunteer reports' },

  loadingTitle: { id: 'Memuat insiden…', en: 'Loading incident…' },
  notFoundTitle: { id: 'Insiden tidak ditemukan', en: 'Incident not found' },
  notFoundBody: {
    id: 'Insiden ini tidak ada atau Anda tidak punya akses. Kembali ke daftar dan pilih insiden lain.',
    en: 'This incident does not exist or you do not have access. Go back to the list and pick another.',
  },
  failedTitle: { id: 'Insiden tidak bisa dimuat', en: 'Could not load this incident' },
  failedBody: { id: 'Terjadi masalah di server. Tidak ada yang diubah. Coba lagi.', en: 'Something went wrong on the server. Nothing was changed. Try again.' },
  retry: { id: 'Coba lagi', en: 'Try again' },

  lostTitle: { id: 'Menyambung kembali…', en: 'Reconnecting…' },
  lostUpdate: { id: 'pembaruan terakhir', en: 'last update' },
  lostBody: { id: 'Semua di bawah ini adalah keadaan terakhir yang diketahui. Mencoba lagi tiap', en: 'Everything below is the last known state. Retrying every' },
  lostNever: { id: 'Belum ada data yang pernah dimuat.', en: 'Nothing has been loaded yet.' },
  retryNow: { id: 'Coba sekarang', en: 'Retry now' },
  restored: { id: 'Tersambung kembali. Data diperbarui.', en: 'Back online. Everything is refreshed.' },
  worksTitle: { id: 'YANG TETAP BERJALAN TANPA KONSOL', en: 'WHAT STILL WORKS WITHOUT YOUR CONSOLE' },
  works: [
    {
      id: 'Aturan keselamatan berjalan di server. Jika asap atau angin menjadi berbahaya, MUNDUR tetap sampai ke setiap ponsel.',
      en: 'Safety rules run on the server. If smoke or wind turns dangerous, WITHDRAW still reaches every phone.',
    },
    {
      id: 'Relawan menyimpan instruksi terakhir mereka dan tetap bisa saling bicara.',
      en: 'Volunteers keep their last instruction and can still talk to each other.',
    },
    {
      id: 'Tidak ada yang Anda ketik sekarang yang diantrekan. Instruksi yang terlambat bisa berbahaya, jadi pengiriman diblokir sampai Anda kembali.',
      en: 'Nothing you type now is queued — an instruction delivered late can be dangerous, so sending is blocked until you are back.',
    },
  ],
  seconds: { id: 'dtk', en: 's' },
  minAgo: { id: 'menit lalu', en: 'min ago' },
  justNow: { id: 'baru saja', en: 'just now' },
} as const

export const severityName: Record<Severity, { id: string; en: string }> = {
  none: { id: 'Tidak ada api', en: 'No fire' },
  smoke: { id: 'Asap', en: 'Smoke' },
  small_flame: { id: 'Api kecil', en: 'Small flame' },
  large_flame: { id: 'Api besar', en: 'Large flame' },
  unknown: { id: 'Tidak diketahui', en: 'Unknown' },
}

export const statusName: Record<IncidentStatus, { id: string; en: string }> = {
  open: { id: 'TERBUKA', en: 'OPEN' },
  held: { id: 'DITAHAN · KONFLIK', en: 'HELD · CONFLICT' },
  verified: { id: 'TERVERIFIKASI', en: 'VERIFIED' },
  extinguished: { id: 'PADAM', en: 'EXTINGUISHED' },
}

export const taskStatusName: Record<TaskStatus, { id: string; en: string }> = {
  proposed: { id: 'menunggu persetujuan', en: 'waiting for approval' },
  approved: { id: 'terkirim', en: 'sent' },
  rejected: { id: 'ditolak', en: 'rejected' },
}

/** Labels for the task rows on the detail screen. The queue page keeps its English rows. */
export const taskCopy = {
  type: {
    verify: { id: 'Verifikasi', en: 'Verify' },
    investigate: { id: 'Kirim tim', en: 'Dispatch' },
    withdraw: { id: 'Mundur', en: 'Withdraw' },
    instruct: { id: 'Instruksi', en: 'Instruction' },
  },
  instruction: { id: 'Instruksi', en: 'Instruction' },
  save: { id: 'Simpan', en: 'Save' },
  cancel: { id: 'Batal', en: 'Cancel' },
  approve: { id: 'Setujui', en: 'Approve' },
  edit: { id: 'Ubah', en: 'Edit' },
  reject: { id: 'Tolak', en: 'Reject' },
  held: { id: 'Dispatch ditahan sampai konflik selesai.', en: 'Dispatch is held until the conflict is resolved.' },
  reportFrom: { id: 'Laporan dari', en: 'Report from' },
  sourceLabel: { id: 'Sumber', en: 'Source' },
} as const

import { t, type Lang } from '../../pwa/i18n'
import { ApiError } from '../../pwa/api/types'
import type { WithdrawState } from './withdrawState'

/** WITHDRAW not confirmed. Bahasa is DRAFT and needs native-speaker review. */
export const stateCopy = {
  inForce: { id: 'MUNDUR BERLAKU', en: 'WITHDRAW IN FORCE' },
  sentByCode: { id: 'DIKIRIM OLEH KODE', en: 'SENT BY CODE' },
  sentBySupervisor: { id: 'DIKIRIM OLEH SUPERVISOR', en: 'SENT BY SUPERVISOR' },
  rule: { id: 'TANPA PERSETUJUAN · TIDAK BISA DIBATALKAN DI SINI', en: 'NO APPROVAL NEEDED · CANNOT BE CANCELLED HERE' },
  reasonLabel: { id: 'Alasan', en: 'Reason' },
  noReason: { id: 'Alasan tidak dicatat.', en: 'No reason was recorded.' },
  confirmedOf: { id: 'sudah aman di arah angin', en: 'confirmed safe upwind' },
  of: { id: 'dari', en: 'of' },
  progress: { id: 'Relawan yang sudah dipastikan aman', en: 'Volunteers confirmed safe' },
  call: { id: 'Hubungi', en: 'Call' },
  noPhone: { id: 'Belum ada nomor telepon', en: 'No phone number on file' },
  markSafe: { id: 'Tandai sudah aman', en: 'Mark found safe' },
  confirmAsk: { id: 'Tandai sudah aman?', en: 'Mark found safe?' },
  confirmYes: { id: 'Ya, sudah aman', en: 'Yes, found safe' },
  confirmNo: { id: 'Belum', en: 'Not yet' },
  saving: { id: 'Menyimpan…', en: 'Saving…' },
  logged: { id: 'tercatat', en: 'logged' },
  markedSafe: { id: 'ditandai sudah aman', en: 'marked found safe' },
  allSafe: { id: 'Semua relawan sudah dipastikan aman. MUNDUR tetap berlaku sampai kode mencabutnya.', en: 'Every volunteer is confirmed safe. WITHDRAW stays in force until code clears it.' },
  paused: {
    id: 'Instruksi dijeda selama MUNDUR berlaku. Instruksi lanjut saat kode mencabutnya atau Anda menandai semua relawan aman.',
    en: 'Instructions are paused while WITHDRAW is in force. They resume when code clears it or you mark everyone safe.',
  },
  notConfirmed: { id: 'belum dipastikan', en: 'not confirmed' },
  noLastContact: { id: 'Kontak terakhir belum tersedia', en: 'Last contact not available yet' },
  safeLine: { id: 'sudah aman di arah angin', en: 'confirmed safe upwind' },
  withdrawLabel: { id: 'MUNDUR', en: 'WITHDRAW' },
  pillOf: { id: 'AMAN', en: 'SAFE' },
  errNetwork: {
    id: 'Tidak bisa menghubungi ember-api, jadi belum tersimpan. MUNDUR tetap berlaku. Periksa koneksi lalu coba lagi.',
    en: 'Could not reach ember-api, so nothing was saved. WITHDRAW is still in force. Check the connection and try again.',
  },
  errAlready: {
    id: 'Relawan ini sudah ditandai aman oleh orang lain. Layar diperbarui. MUNDUR tetap berlaku.',
    en: 'This volunteer was already marked safe. The screen is updated. WITHDRAW is still in force.',
  },
  errNoWithdraw: {
    id: 'Insiden ini tidak punya MUNDUR yang berlaku, jadi tidak ada yang ditandai. Layar diperbarui.',
    en: 'This incident has no active WITHDRAW, so nothing was marked. The screen is updated.',
  },
  errUnknown: {
    id: 'Relawan ini tidak termasuk dalam MUNDUR ini. Tidak ada yang diubah. Muat ulang insiden lalu coba lagi.',
    en: 'This volunteer is not part of this WITHDRAW. Nothing was changed. Reload the incident and try again.',
  },
  errSession: {
    id: 'Sesi ini tidak boleh menandai relawan aman. Masuk lagi sebagai supervisor. MUNDUR tetap berlaku.',
    en: 'This session cannot mark volunteers safe. Sign in again as a supervisor. WITHDRAW is still in force.',
  },
  errGone: {
    id: 'Insiden ini sudah tidak ada. Kembali ke daftar insiden.',
    en: 'This incident no longer exists. Go back to the incident list.',
  },
  errServer: {
    id: 'ember-api tidak bisa menyimpan ini dan belum ada yang berubah. MUNDUR tetap berlaku. Coba lagi.',
    en: 'ember-api could not save this and nothing changed. WITHDRAW is still in force. Try again.',
  },
} as const

export type SafeFailure = 'network' | 'already' | 'no_withdraw' | 'unknown' | 'session' | 'gone' | 'server'

/** Why a "found safe" write failed, from the error alone. */
export function safeFailureOf(error: unknown): SafeFailure {
  if (!(error instanceof ApiError)) return 'server'
  if (error.code === 'network') return 'network'
  if (error.status === 409) return /already/i.test(error.message) ? 'already' : 'no_withdraw'
  if (error.status === 400) return 'unknown'
  if (error.status === 401 || error.status === 403) return 'session'
  if (error.status === 404) return 'gone'
  return 'server'
}

const failureText = {
  network: stateCopy.errNetwork,
  already: stateCopy.errAlready,
  no_withdraw: stateCopy.errNoWithdraw,
  unknown: stateCopy.errUnknown,
  session: stateCopy.errSession,
  gone: stateCopy.errGone,
  server: stateCopy.errServer,
} as const

export function safeFailureText(error: unknown, lang: Lang): string {
  return t(lang, failureText[safeFailureOf(error)])
}

/** "3 of 4" in the supervisor's language. */
export function countText(lang: Lang, state: Pick<WithdrawState, 'confirmed' | 'total'>): string {
  return `${state.confirmed} ${t(lang, stateCopy.of)} ${state.total}`
}

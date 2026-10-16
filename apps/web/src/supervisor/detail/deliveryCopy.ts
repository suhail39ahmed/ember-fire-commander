import { t, type Lang } from '../../pwa/i18n'
import { ApiError } from '../../pwa/api/types'

/** Instruction delivered. Bahasa is DRAFT and needs native-speaker review. */
export const deliveryCopy = {
  heard: { id: 'didengar', en: 'heard' },
  notHeard: { id: 'Belum didengar', en: 'Not heard yet' },
  notHeardAfter: { id: 'Tidak didengar', en: 'Not heard' },
  sent: { id: 'terkirim', en: 'sent' },
  resendIn: { id: 'kirim ulang dalam', en: 'resend in' },
  resend: { id: 'Kirim ulang', en: 'Resend' },
  resending: { id: 'Mengirim…', en: 'Sending…' },
  resent: { id: 'Dikirim ulang', en: 'Sent again' },
  audit: { id: 'audit', en: 'audit' },
  attempt: { id: 'percobaan', en: 'attempt' },
  toastHeard: { id: 'mendengarnya', en: 'heard it' },
  toastOn: { id: 'di ponselnya', en: 'on their phone' },
  toastLogged: { id: 'tercatat', en: 'logged' },
  toastNoUndo: { id: 'TIDAK BISA DIBATALKAN · AUDIT', en: 'UNDO NOT POSSIBLE · AUDIT' },
  toastClose: { id: 'Tutup', en: 'Dismiss' },
  errNetwork: {
    id: 'Tidak bisa menghubungi ember-api, jadi instruksi belum dikirim ulang. Periksa koneksi lalu coba lagi.',
    en: 'Could not reach ember-api, so the instruction was not sent again. Check the connection and try again.',
  },
  errHeard: {
    id: 'Relawan ini baru saja mendengar instruksinya, jadi tidak perlu dikirim ulang. Layar diperbarui.',
    en: 'This volunteer just heard the instruction, so it does not need sending again. The screen is updated.',
  },
  errRefused: {
    id: 'Instruksi ini tidak bisa dikirim ulang sekarang. Layar diperbarui.',
    en: 'This instruction can’t be sent again now. The screen is updated.',
  },
  errSession: {
    id: 'Sesi ini tidak boleh mengirim ulang. Masuk lagi sebagai supervisor.',
    en: 'This session cannot resend. Sign in again as a supervisor.',
  },
  errGone: {
    id: 'Instruksi ini sudah tidak ada. Periksa insidennya.',
    en: 'This instruction no longer exists. Check the incident.',
  },
  errServer: {
    id: 'ember-api tidak bisa mengirim ulang instruksi ini dan belum ada yang berubah. Coba lagi.',
    en: 'ember-api could not send this instruction again and nothing changed. Try again.',
  },
} as const

export function resendFailureText(error: unknown, lang: Lang): string {
  if (error instanceof ApiError) {
    if (error.code === 'network') return t(lang, deliveryCopy.errNetwork)
    if (error.status === 409) return t(lang, /heard/i.test(error.message) ? deliveryCopy.errHeard : deliveryCopy.errRefused)
    if (error.status === 401 || error.status === 403) return t(lang, deliveryCopy.errSession)
    if (error.status === 404) return t(lang, deliveryCopy.errGone)
  }
  return t(lang, deliveryCopy.errServer)
}

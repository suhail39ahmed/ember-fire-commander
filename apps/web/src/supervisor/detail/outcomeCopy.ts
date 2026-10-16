import { t, type Lang } from '../../pwa/i18n'
import { ApiError } from '../../pwa/api/types'
import type { Outcome, OutcomeAction, OutcomeReason } from '../IncidentView'

/**
 * Plain-language results for approve, reject, edit and verify, in the supervisor's language.
 * The wording never carries a status code, an exception name or server text.
 */
const done: Record<OutcomeAction, { id: string; en: string }> = {
  approve: { id: 'Disetujui', en: 'Approved' },
  reject: { id: 'Ditolak', en: 'Rejected' },
  edit: { id: 'Instruksi disimpan', en: 'Instruction saved' },
  verify: { id: 'Terverifikasi', en: 'Verified' },
}

const failed: Record<OutcomeReason, { id: string; en: string }> = {
  network: {
    id: 'Tidak bisa menghubungi ember-api. Tidak ada yang diubah. Coba lagi saat koneksi kembali.',
    en: 'Could not reach ember-api. Nothing was changed. Try again when the connection is back.',
  },
  held: {
    id: 'Dispatch tidak bisa disetujui selama laporan masih berbeda. Tidak ada yang diubah.',
    en: 'Dispatch can’t be approved while the reports disagree. Nothing was changed.',
  },
  not_proposed: {
    id: 'Usulan ini sudah diputuskan. Daftar dimuat ulang dan tidak ada yang diubah.',
    en: 'This proposal was already decided. The list was refreshed and nothing was changed.',
  },
  withdraw_task: {
    id: 'Instruksi mundur tidak bisa disetujui, ditolak, atau diubah.',
    en: 'A withdraw instruction can’t be approved, rejected, or edited.',
  },
  forbidden: {
    id: 'Hanya supervisor yang bisa melakukan ini. Masuk lagi sebagai supervisor.',
    en: 'Only a supervisor can do this. Sign in again as a supervisor.',
  },
  not_found: {
    id: 'Usulan atau insiden ini sudah tidak ada. Daftar dimuat ulang.',
    en: 'This proposal or incident no longer exists. The list was refreshed.',
  },
  invalid: {
    id: 'Instruksi tidak bisa disimpan. Gunakan 1 sampai 500 karakter. Teks lama tetap berlaku.',
    en: 'The instruction can’t be saved. Use 1 to 500 characters. The old text stays.',
  },
  server: {
    id: 'ember-api tidak bisa memproses ini sekarang. Belum ada yang terkonfirmasi. Coba lagi.',
    en: 'ember-api could not do this right now. Nothing was confirmed. Try again.',
  },
}

/** Which plain-language result a failed call maps to. The server's English sentences only pick the 409 case. */
export function reasonOf(error: unknown): OutcomeReason {
  if (!(error instanceof ApiError)) return 'server'
  if (error.code === 'network') return 'network'
  if (error.status === 401 || error.status === 403) return 'forbidden'
  if (error.status === 404) return 'not_found'
  if (error.status === 400) return 'invalid'
  if (error.status === 409) {
    if (/held|conflict/i.test(error.message)) return 'held'
    if (/withdraw/i.test(error.message)) return 'withdraw_task'
    return 'not_proposed'
  }
  return 'server'
}

/** The line to show for an outcome. An outcome with no structured facts keeps the text it was given. */
export function outcomeText(outcome: Outcome, lang: Lang): string {
  if (outcome.kind === 'error' && outcome.reason) return t(lang, failed[outcome.reason])
  if (outcome.kind === 'ok' && outcome.action && outcome.auditId) return `${t(lang, done[outcome.action])} · audit ${outcome.auditId}`
  return outcome.text
}

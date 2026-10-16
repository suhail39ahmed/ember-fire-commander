/** Labels for what a volunteer card, the withdraw banner and the timeline say from the supervisor read. Bahasa is DRAFT and needs native-speaker review. */
import type { AuditAction } from '../contracts'

export const cardCopy = {
  distance: { id: 'm dari pusat insiden', en: 'm from the incident centre' },
  lastReport: { id: 'Laporan terakhir', en: 'Last report' },
  heard: { id: 'Terdengar di ponsel', en: 'Heard on device' },
  notHeard: { id: 'Belum terdengar di ponsel', en: 'Not heard on device yet' },
  delivery: {
    sent: { id: 'Notifikasi terkirim', en: 'Push sent' },
    failed: { id: 'Notifikasi gagal', en: 'Push failed' },
    skipped: { id: 'Tanpa token perangkat, notifikasi dilewati', en: 'No device token, push skipped' },
  },
  markedSafe: { id: 'Ditandai aman', en: 'Marked safe' },
  by: { id: 'oleh', en: 'by' },
  sentAgain: { id: 'dikirim ulang', en: 'sent again' },
} as const

export const summaryCopy = {
  title: { id: 'RINGKASAN', en: 'SUMMARY' },
  note: { id: 'bersifat saran · bukan tingkat insiden', en: 'advisory · not the incident severity' },
  model: { id: 'ditulis ulang model', en: 'reworded by a model' },
  template: { id: 'templat dari fakta', en: 'template from the facts' },
} as const

export const timelineCopy = {
  note: { id: 'Laporan dan tindakan, dari catatan tersimpan', en: 'Reports and actions, from the stored records' },
  code: { id: 'Kode', en: 'Code' },
  supervisor: { id: 'Supervisor', en: 'Supervisor' },
  action: {
    'observation.create': { id: 'laporan diterima', en: 'report received' },
    'task.approve': { id: 'menyetujui instruksi', en: 'approved an instruction' },
    'task.reject': { id: 'menolak instruksi', en: 'rejected an instruction' },
    'task.edit': { id: 'mengubah instruksi', en: 'edited an instruction' },
    'task.heard': { id: 'instruksi terdengar di ponsel', en: 'instruction heard on device' },
    'task.instruct': { id: 'mengirim instruksi ke satu relawan', en: 'sent an instruction to one volunteer' },
    'task.resend': { id: 'mengirim ulang instruksi', en: 'sent an instruction again' },
    'task.withdraw': { id: 'mengirim MUNDUR', en: 'sent WITHDRAW' },
    'withdraw.safe': { id: 'menandai relawan aman', en: 'marked a volunteer safe' },
    'incident.verify': { id: 'memverifikasi insiden', en: 'verified the incident' },
    'incident.extinguish': { id: 'menandai insiden padam', en: 'marked the incident extinguished' },
    'incident.severity.lower': { id: 'menurunkan tingkat', en: 'lowered the severity' },
    'incident.severity.raise': { id: 'menaikkan tingkat', en: 'raised the severity' },
    'site.reinspect': { id: 'menemukan aktivitas baru di lokasi padam', en: 'found new activity at the extinguished site' },
    'site.dismiss': { id: 'menutup peringatan nyala ulang', en: 'dismissed a re-ignition alert' },
    'site.recheck': { id: 'meminta pemeriksaan ulang lokasi padam', en: 'asked for a re-check of the extinguished site' },
    'live.make': { id: 'menempatkan kursi live', en: 'assigned the live seat' },
    'live.retry': { id: 'mencoba video live lagi', en: 'retried live video' },
    'live.drop': { id: 'video live terputus', en: 'live video dropped' },
  } satisfies Record<AuditAction, { id: string; en: string }>,
} as const

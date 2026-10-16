/**
 * Chrome labels. Bahasa is DRAFT and needs native-speaker review, like pwa/i18n.ts.
 * The incident queue keeps its existing English copy.
 */
export const chromeCopy = {
  incidents: { id: 'Insiden', en: 'Incidents' },
  approvals: { id: 'Persetujuan', en: 'Approvals' },
  map: { id: 'Peta', en: 'Map' },
  audit: { id: 'Log audit', en: 'Audit log' },
  settings: { id: 'Pengaturan', en: 'Settings' },
  notAvailable: { id: 'Belum tersedia', en: 'Not available yet' },
  title: { id: 'Konsol Supervisor', en: 'Supervisor Console' },
  onDuty: { id: 'Sedang bertugas', en: 'On duty' },
  account: { id: 'Akun', en: 'Account' },
  noAgency: { id: 'Instansi belum tercatat', en: 'No agency on file' },
  failed: {
    id: 'Jam server atau jumlah persetujuan tidak bisa dimuat.',
    en: 'Could not load the clock or approvals count.',
  },
  offline: {
    id: 'Tidak bisa menghubungi ember-api. Menu tetap tersedia.',
    en: 'Could not reach ember-api. The menu is still available.',
  },
  loading: { id: 'Memuat…', en: 'Loading…' },
  serverTime: { id: 'Waktu server', en: 'Server time' },
  menu: { id: 'Menu konsol', en: 'Console menu' },
} as const

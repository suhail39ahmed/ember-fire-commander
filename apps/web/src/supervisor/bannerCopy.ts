/**
 * Live-banner labels. Bahasa is DRAFT and needs native-speaker review, like chromeCopy.ts.
 * Counts, times, and ids come from GET /dashboard. Missing fields stay an em dash.
 */
export const bannerCopy = {
  live: { id: 'SIAGA', en: 'LIVE' },
  oneFire: { id: '1 KEBAKARAN PERLU ANDA', en: '1 FIRE NEEDS YOU' },
  manyFires: { id: 'KEBAKARAN PERLU ANDA', en: 'FIRES NEED YOU' },
  updated: { id: 'Diperbarui', en: 'Updated' },
  satellite: { id: 'lintasan satelit berikutnya', en: 'next satellite pass' },
  empty: { id: '—', en: '—' },
  onSite: { id: 'di lokasi', en: 'on site' },
  since: { id: 'sejak', en: 'since' },
  open: { id: 'Buka', en: 'Open' },
  withdraw: { id: 'Tarik diri', en: 'Withdraw' },
  loading: { id: 'Memuat kebakaran siaga…', en: 'Loading live fires…' },
  retry: {
    id: 'Menampilkan kebakaran siaga terakhir. Mencoba lagi.',
    en: 'Showing the last live fires. Retrying.',
  },
  retryEmpty: {
    id: 'Kebakaran siaga tidak bisa dimuat. Mencoba lagi.',
    en: 'Could not load live fires. Retrying.',
  },
} as const

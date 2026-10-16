/**
 * Season-impact labels. Bahasa is DRAFT and needs native-speaker review.
 * Figures, notes, the since-date, the region, and the crew count come from
 * GET /dashboard. Missing values stay an em dash.
 */
export const seasonCopy = {
  title: { id: 'Dampak musim', en: 'Season impact' },
  since: { id: 'Sejak', en: 'Since' },
  crews: { id: 'kru desa', en: 'village crews' },
  howWeCount: { id: 'Cara kami menghitung', en: 'How we count' },
  firesContained: { id: 'Kebakaran tertangani', en: 'Fires contained' },
  falseAlarms: { id: 'Alarm palsu disingkirkan', en: 'False alarms cleared' },
  injuries: { id: 'Cedera relawan', en: 'Volunteer injuries' },
  medianTime: { id: 'Median waktu sampai pemeriksaan manusia', en: 'Median time to human check' },
  reignitions: { id: 'Nyala kembali tertangkap', en: 'Re-ignitions caught' },
  loading: { id: 'Memuat dampak musim…', en: 'Loading season impact…' },
  retry: {
    id: 'Menampilkan dampak musim terakhir. Mencoba lagi.',
    en: 'Showing the last season impact. Retrying.',
  },
  retryEmpty: {
    id: 'Dampak musim tidak bisa dimuat. Mencoba lagi.',
    en: 'Could not load season impact. Retrying.',
  },
} as const

/**
 * Chart-card labels. Bahasa is DRAFT and needs native-speaker review.
 * Figures, bars, and subtitles come from GET /dashboard. Missing values stay an em dash.
 */
export const chartCopy = {
  satellite: { id: 'Jejak satelit minggu ini', en: 'Satellite leads this week' },
  realFires: { id: 'Kebakaran nyata', en: 'Real fire' },
  dismissed: { id: 'Disingkirkan', en: 'Dismissed' },
  days: { id: 'S S R K J S M', en: 'M T W T F S S' },
  median: { id: 'Waktu sampai pemeriksaan manusia', en: 'Time to human check' },
  today: { id: 'Hari ini', en: 'Today' },
  target: { id: 'target', en: 'target' },
  crews: { id: 'Kru saat ini', en: 'Crews right now' },
  onSite: { id: 'Di lokasi', en: 'On site' },
  enRoute: { id: 'Dalam perjalanan', en: 'En route' },
  ready: { id: 'Siaga', en: 'Ready' },
  offline: { id: 'Luring', en: 'Offline' },
  weather: { id: 'Cuaca sekarang', en: 'Weather now' },
  airTemp: { id: 'Suhu udara', en: 'Air temp' },
  humidity: { id: 'Kelembapan', en: 'Humidity' },
  wind: { id: 'Angin', en: 'Wind' },
  rain: { id: 'Hujan', en: 'Rain' },
  loading: { id: 'Memuat grafik…', en: 'Loading charts…' },
  retry: {
    id: 'Menampilkan grafik terakhir. Mencoba lagi.',
    en: 'Showing the last charts. Retrying.',
  },
  retryEmpty: {
    id: 'Grafik tidak bisa dimuat. Mencoba lagi.',
    en: 'Could not load charts. Retrying.',
  },
} as const

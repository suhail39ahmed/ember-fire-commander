/** Labels for the header line and the conditions cards of the incident detail. Bahasa is DRAFT and needs native-speaker review. */
export const conditionsCopy = {
  opened: { id: 'dibuka', en: 'opened' },
  via: { id: 'dari laporan', en: 'from a' },
  windLabel: { id: 'ANGIN', en: 'WIND' },
  windFrom: { id: 'dari', en: 'from' },
  gust: { id: 'hembusan', en: 'gusts' },
  stationNote: {
    id: 'Bacaan titik pantau cuaca, bukan di lokasi insiden',
    en: 'Weather monitoring point reading, not measured at the incident',
  },
  airLabel: { id: 'UDARA', en: 'AIR' },
  airNote: { id: 'Data kualitas udara nasional, bukan di lokasi insiden', en: 'National air-quality feed, not measured at the incident' },
  psi: { id: 'PSI 24 jam', en: '24 h PSI' },
  pm25: { id: 'PM2.5 tertinggi', en: 'highest PM2.5' },
  humidity: { id: 'kelembapan', en: 'humidity' },
  rain: { id: 'hujan', en: 'rain' },
  at: { id: 'dibaca', en: 'read at' },
} as const

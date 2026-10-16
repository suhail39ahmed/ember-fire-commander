/**
 * Live-map layer labels. Bahasa is DRAFT and needs native-speaker review.
 * Fires come from the incident list, Crews from the open incident's volunteers, Wind from the dashboard weather.
 * Satellite leads are never sent to clients, so there is no Satellite toggle.
 */
export const mapCopy = {
  title: { id: 'Peta siaga', en: 'Live map' },
  loading: { id: 'Memuat peta…', en: 'Loading the map…' },
  fires: { id: 'Kebakaran', en: 'Fires' },
  crews: { id: 'Kru', en: 'Crews' },
  wind: { id: 'Angin', en: 'Wind' },
  peat: { id: 'Kekeringan gambut', en: 'Peat dryness' },
  staticLayer: { id: 'Tetap', en: 'Static' },
  nothing: { id: 'Tidak ada yang ditampilkan.', en: 'Nothing to show.' },
  firesOff: {
    id: 'Lapisan kebakaran dimatikan. Tekan Kebakaran untuk menyalakannya.',
    en: 'Fires layer is off. Press Fires to turn it on.',
  },
  crewsNone: {
    id: 'Belum ada posisi kru dari insiden yang dibuka.',
    en: 'No crew positions reported for the open incident.',
  },
  crewsShown: { id: 'kru', en: 'crew' },
} as const

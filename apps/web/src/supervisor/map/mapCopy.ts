/**
 * Live-map layer labels. Bahasa is DRAFT and needs native-speaker review.
 * Only the Fires layer has positions. The other layers have no client source.
 */
export const mapCopy = {
  title: { id: 'Peta siaga', en: 'Live map' },
  loading: { id: 'Memuat peta…', en: 'Loading the map…' },
  fires: { id: 'Kebakaran', en: 'Fires' },
  crews: { id: 'Kru', en: 'Crews' },
  wind: { id: 'Angin', en: 'Wind' },
  satellite: { id: 'Jejak satelit', en: 'Satellite leads' },
  peat: { id: 'Kekeringan gambut', en: 'Peat dryness' },
  staticLayer: { id: 'Tetap', en: 'Static' },
  nothing: { id: 'Tidak ada yang ditampilkan.', en: 'Nothing to show.' },
  firesOff: { id: 'Lapisan kebakaran dimatikan.', en: 'Fires layer is off.' },
} as const

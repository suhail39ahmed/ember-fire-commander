/**
 * Live seat / video-drop copy (#102). Bahasa is DRAFT and needs native-speaker review.
 */
export const liveCopy = {
  dropTitle: {
    id: 'Video langsung terputus',
    en: 'Live video dropped',
  },
  dropBody: {
    id: 'EMBER memindahkannya ke foto setiap 60 dtk — suara masih jalan. Jadikan orang lain live, atau coba lagi saat sinyal pulih.',
    en: 'EMBER switched them to a photo every 60 s — voice still works. Make someone else live, or retry when their signal recovers.',
  },
  signalFell: { id: 'Sinyalnya turun ke', en: 'Their signal fell to' },
  droppedAt: { id: 'terputus pukul', en: 'dropped at' },
  seatFree: { id: 'Kursi live kosong', en: 'Live seat is free' },
  seatHeld: { id: 'Kursi live dipegang', en: 'Live seat held by' },
  photoCadence: { id: 'FOTO · SETIAP 60 DTK', en: 'PHOTO · EVERY 60 S' },
  liveBadge: { id: 'VIDEO LANGSUNG', en: 'LIVE VIDEO' },
  retry: { id: 'Coba live lagi', en: 'Retry live' },
  retryNeeds: { id: 'Coba live lagi — butuh 3G atau lebih baik', en: 'Retry live — needs 3G or better' },
  makeLive: { id: 'Jadikan live — kursi kosong', en: 'Make live — seat is free' },
  makeLiveNamed: { id: 'Jadikan {name} live — kursi kosong', en: 'Make {name} live — seat is free' },
  holding: { id: 'Sedang live', en: 'On the live seat' },
  failed: {
    id: 'Kursi live tidak berubah. Coba lagi.',
    en: 'Could not update the live seat. Try again.',
  },
  reasonSignal: { id: 'sinyal di bawah 3G', en: 'signal below 3G' },
  reasonLost: { id: 'koneksi terputus', en: 'connection lost' },
} as const

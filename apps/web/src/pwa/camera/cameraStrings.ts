/** Copy for the live camera panel on the Report tab. Bahasa is draft. The word AI is only used where a model writes. */
export const cameraStrings = {
  toggle: { id: 'Kamera', en: 'Camera' },
  turnOn: { id: 'Nyalakan kamera', en: 'Turn camera on' },
  turnOff: { id: 'Matikan kamera', en: 'Turn camera off' },
  panel: { id: 'Pratinjau kamera langsung', en: 'Live camera preview' },
  back: { id: 'Kembali', en: 'Back' },
  accuracy: { id: 'Akurasi lokasi', en: 'Location accuracy' },
  captionOff: { id: 'KAMERA MATI · KETUK UNTUK MENYALAKAN', en: 'CAMERA OFF · TAP TO TURN ON' },
  captionStarting: { id: 'MEMBUKA KAMERA…', en: 'OPENING CAMERA…' },
  /** The preview is on this phone's screen only. */
  captionPreview: { id: 'KAMERA LANGSUNG · HANYA PRATINJAU', en: 'LIVE CAMERA · PREVIEW ONLY' },
  /** Only shown when frames really go to the coach. */
  captionToCoach: { id: 'KAMERA LANGSUNG · ~1 FPS KE COACH', en: 'LIVE CAMERA · ~1 FPS TO COACH' },
  captionProblem: { id: 'KAMERA TIDAK AKTIF', en: 'CAMERA NOT AVAILABLE' },
  denied: {
    id: 'Kamera diblokir. Buka Pengaturan situs → Kamera → Izinkan, lalu ketuk tombol kamera.',
    en: 'Camera is blocked. Open Site settings → Camera → Allow, then tap the camera button.',
  },
  unavailable: {
    id: 'Tidak ada kamera yang bisa dipakai di perangkat ini. Foto dan laporan di bawah tetap bisa dipakai.',
    en: 'No usable camera on this device. The photo and report below still work.',
  },
  busy: {
    id: 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu, lalu coba lagi.',
    en: 'Another app is using the camera. Close it, then try again.',
  },
  insecure: {
    id: 'Kamera butuh sambungan aman (https). Buka EMBER lewat alamat https.',
    en: 'The camera needs a secure (https) connection. Open EMBER from its https address.',
  },
} as const

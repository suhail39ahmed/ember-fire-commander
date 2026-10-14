/** Photo upload copy (#20). Bahasa Indonesia default; DRAFT, needs native-speaker review. */
export const photoStrings = {
  label: { id: 'UNGGAH FOTO', en: 'PHOTO UPLOAD' },
  take: { id: '📷 Ambil foto', en: '📷 Take photo' },
  framing: {
    id: 'Arahkan ke api, asap, dan tanah. Jangan memotret wajah orang.',
    en: 'Point at the fire, smoke and ground. Do not photograph faces.',
  },
  preparing: { id: 'Menyiapkan foto…', en: 'Preparing photo…' },
  uploading: { id: 'Mengunggah foto…', en: 'Uploading photo…' },
  keepOpen: { id: 'Biarkan EMBER tetap terbuka sampai foto terunggah.', en: 'Keep EMBER open until the photo is uploaded.' },
  waiting: { id: 'Menunggu unggahan…', en: 'Waiting for upload…' },
  cancel: { id: 'Batal', en: 'Cancel' },
  submitting: { id: 'Mengirim laporan foto…', en: 'Sending photo report…' },
  uploaded: { id: 'Terunggah ✓', en: 'Uploaded ✓' },
  uploadedDetail: { id: 'Supervisor Anda bisa melihat foto ini sekarang.', en: 'Your supervisor can see this photo now.' },
  another: { id: 'Ambil foto lain', en: 'Take another photo' },
  failed: { id: 'Unggah gagal — periksa sinyal', en: 'Upload failed — check signal' },
  failedDetail: {
    id: 'Pindah ke tempat dengan sinyal lebih baik, lalu coba lagi.',
    en: 'Move to a spot with better signal, then retry.',
  },
  submitFailed: { id: 'Foto terunggah, laporan belum terkirim.', en: 'Photo uploaded, report not sent yet.' },
  rejected: { id: 'Foto ditolak oleh server:', en: 'The server rejected the photo:' },
  retry: { id: 'Coba lagi', en: 'Retry' },
  retake: { id: 'Ambil ulang', en: 'Retake photo' },
  badFile: { id: 'Pilih foto (JPEG/WebP, maks. 25 MB).', en: 'Choose a photo (JPEG/WebP, up to 25 MB).' },
  noLocation: {
    id: 'Lokasi tidak tersedia. Nyalakan lokasi lalu ambil foto lagi.',
    en: 'Location unavailable. Turn on location and take the photo again.',
  },
  previewAlt: { id: 'Pratinjau foto', en: 'Photo preview' },
  takenAt: { id: 'Foto', en: 'Photo' },
} as const

/** Copy for hold-to-talk and coach reply (#129, #130). Bahasa is draft. */
export const gatewayStrings = {
  /** What the volunteer said, as the gateway heard it. Not model text, so no "AI" in this label. */
  youTranscript: { id: 'ANDA · TRANSKRIP LANGSUNG', en: 'YOU · LIVE TRANSCRIPT' },
  listeningHint: { id: 'Mendengarkan… lepas untuk kirim.', en: 'Listening… release to send.' },
  releaseHint: {
    id: 'Lepas untuk mengirim. Laporan suara terkirim sendiri saat Anda melepas.',
    en: 'Release to send. Voice reports send themselves when you release.',
  },
  unavailableHint: {
    id: 'Suara tidak tersedia di browser ini. Pakai chip atau catatan di bawah.',
    en: 'Voice is not available in this browser. Use a chip or note below.',
  },
  noTranscript: {
    id: 'Tidak ada teks dari suara. Pakai chip atau tulis catatan, lalu kirim.',
    en: 'No spoken text arrived. Use a chip or write a note, then send.',
  },
  noLocation: {
    id: 'Lokasi diperlukan untuk mengirim laporan suara. Izinkan lokasi, lalu coba lagi.',
    en: 'Location is needed to send a voice report. Allow location, then try again.',
  },
  /** The coach card is model output, so the label says AI. */
  coachLabel: { id: 'COACH AI', en: 'AI COACH' },
  replyWaiting: { id: 'Menunggu jawaban…', en: 'Waiting for the reply…' },
  /** Shown under Hold to talk once the report is stored and the API gave a time or an incident. */
  savedAsReport: { id: 'Tersimpan sebagai laporan', en: 'Saved as a report' },
}

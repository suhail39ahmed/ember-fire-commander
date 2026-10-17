/** Approvals page labels. Bahasa is DRAFT and needs native-speaker review, like chromeCopy.ts. */
export const approvalsCopy = {
  title: { id: 'Persetujuan', en: 'Approvals' },
  waiting: { id: 'menunggu keputusan', en: 'waiting for a decision' },
  loading: { id: 'Memuat usulan…', en: 'Loading proposals…' },
  emptyTitle: { id: 'Tidak ada yang menunggu persetujuan', en: 'Nothing is waiting for approval' },
  emptyBody: {
    id: 'Usulan tugas dari agen muncul di sini. Daftar ini diperbarui otomatis.',
    en: 'Task proposals from the agents appear here. This list updates by itself.',
  },
  failed: { id: 'Usulan tidak bisa dimuat. Mencoba lagi.', en: 'Could not load the proposals. Retrying.' },
  noIncident: { id: 'Insiden tidak ditemukan', en: 'Incident not found' },
  openIncident: { id: 'Buka insiden', en: 'Open incident' },
  // Join requests: a volunteer near a fire asks to help. No Figma yet, so this reuses the proposal row.
  joinTitle: { id: 'Permintaan bergabung', en: 'Join requests' },
  joinAsks: { id: 'MINTA BERGABUNG', en: 'ASKS TO JOIN' },
  joinHelp: {
    id: 'Relawan ini ada di dekat api dan ingin membantu. Menyetujui mengirim instruksi pertama ke ponselnya.',
    en: 'This volunteer is near the fire and wants to help. Approving sends the first instruction to their phone.',
  },
  joinInstructionLabel: { id: 'Instruksi pertama', en: 'First instruction' },
  joinInstructionHint: { id: 'Contoh: temui regu di gerbang utara', en: 'For example: meet the crew at the north gate' },
  joinApprove: { id: 'Setujui dan kirim', en: 'Approve and send' },
  joinDecline: { id: 'Tolak', en: 'Decline' },
  joinApproved: { id: 'Ditambahkan ke insiden', en: 'Added to the incident' },
  joinDeclined: { id: 'Permintaan ditolak', en: 'Request declined' },
  joinAudit: { id: 'audit', en: 'audit' },
  joinFailed: { id: 'Tidak tersimpan. Coba lagi.', en: 'Not saved. Try again.' },
  joinInvalid: { id: 'Instruksi wajib diisi, paling banyak 500 karakter.', en: 'The instruction is required, at most 500 characters.' },
  joinConflict: { id: 'Permintaan ini sudah dijawab, atau apinya sudah padam.', en: 'This request was already answered, or the fire is out.' },
  volunteerFallback: { id: 'Relawan', en: 'Volunteer' },
} as const

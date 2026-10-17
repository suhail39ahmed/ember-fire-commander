import type { Lang } from '../pwa/i18n'

/**
 * Copy for the sign-in, role choice, wrong-role and not-found screens.
 * Bahasa copy is DRAFT and needs native-speaker review, like pwa/i18n.ts.
 */
export const copy = {
  eyebrow: {
    volunteer: { id: 'VOLUNTEER APP · RELAWAN', en: 'VOLUNTEER APP · RELAWAN' },
    supervisor: { id: 'KONSOL SUPERVISOR · BPBD', en: 'SUPERVISOR CONSOLE · BPBD' },
    general: { id: 'EMBER · BPBD', en: 'EMBER · BPBD' },
  },
  tagline: {
    volunteer: {
      id: 'Laporkan kebakaran lewat suara, kamera, atau satu ketukan. Supervisor Anda melihatnya dan mengirim bantuan.',
      en: 'Report fires by voice, camera or one tap. Your supervisor sees it and sends help.',
    },
    supervisor: {
      id: 'Setiap laporan penting. Verifikasi peringatan, koordinasikan bantuan, dan dukung relawan. Aturan mundur ditegakkan oleh kode. EMBER hanya menyarankan; manusia yang memutuskan.',
      en: 'Every report matters. Verify alerts, coordinate help, and support volunteers. Withdrawal rules are enforced by code. EMBER only suggests; people decide.',
    },
    general: {
      id: 'Satu agen keselamatan untuk komunitas di kedua ujung asap.',
      en: 'One safety agent for communities at both ends of the smoke.',
    },
  },
  photoAlt: {
    id: 'Petugas pemadam berseragam oranye menyemprotkan air di lereng yang berasap',
    en: 'Firefighters in orange uniforms spraying water on a smoky hillside',
  },
  footnote: { id: 'Demo simulasi · tanpa data relawan nyata', en: 'Simulated demo · no real volunteer data' },
  signIn: {
    volunteer: {
      title: { id: 'Masuk ke EMBER', en: 'Sign in to EMBER' },
      sub: {
        id: 'Aplikasi relawan. Paling nyaman di ponsel; pasang di Layar Utama untuk menerima peringatan.',
        en: 'Volunteer app. Works best on a phone: install it to your Home Screen for alerts.',
      },
    },
    supervisor: {
      title: { id: 'Masuk ke Konsol Supervisor', en: 'Sign in to the Supervisor Console' },
      sub: {
        id: 'Untuk supervisor BPBD yang diundang. Akun Anda harus memiliki peran supervisor.',
        en: 'For invited BPBD supervisors. Your account needs the supervisor role.',
      },
    },
    button: { id: 'Masuk dengan Google', en: 'Sign in with Google' },
    busy: { id: 'Sedang masuk…', en: 'Signing in…' },
    opening: { id: 'Membuka Google…', en: 'Opening Google…' },
    waiting: { id: 'Menunggu jendela Google…', en: 'Waiting for the Google window…' },
    cancelled: { id: 'Masuk dibatalkan. Coba lagi.', en: 'Sign-in was cancelled. Try again.' },
    blocked: {
      id: 'Browser memblokir jendela masuk. Izinkan pop-up untuk situs ini lalu coba lagi.',
      en: 'Your browser blocked the sign-in pop-up. Allow pop-ups for this site and try again.',
    },
    note: { id: 'Anda akan kembali ke halaman yang Anda buka.', en: "You'll come back to the page you opened." },
  },
  roleChoice: {
    title: { id: 'Masuk sebagai siapa?', en: 'Who are you signing in as?' },
    sub: { id: 'Pilih peran Anda untuk masuk.', en: 'Pick your role to sign in.' },
    volunteer: {
      title: { id: 'Saya relawan', en: "I'm a volunteer" },
      desc: { id: 'Laporkan kebakaran, terima tugas dari supervisor Anda', en: 'Report fires, get tasks from your supervisor' },
    },
    supervisor: {
      title: { id: 'Saya supervisor', en: "I'm a supervisor" },
      desc: { id: 'Konsol BPBD: verifikasi, setujui, kirim bantuan', en: 'BPBD console: verify, approve, send help' },
    },
  },
  wrongRole: {
    volunteerOnSupervisorPage: {
      title: { id: 'Halaman ini untuk supervisor', en: 'This page is for supervisors' },
      body: {
        id: 'Akun {email} terdaftar sebagai relawan. Buka aplikasi relawan untuk melapor.',
        en: 'Account {email} is registered as a volunteer. Open the volunteer app to report.',
      },
      action: { id: 'Buka aplikasi relawan', en: 'Open the volunteer app' },
    },
    supervisorOnVolunteerPage: {
      title: { id: 'Halaman ini untuk relawan', en: 'This page is for volunteers' },
      body: {
        id: 'Akun {email} terdaftar sebagai supervisor. Buka konsol untuk meninjau insiden.',
        en: 'Account {email} is registered as a supervisor. Open the console to review incidents.',
      },
      action: { id: 'Buka konsol', en: 'Open the console' },
    },
    code: { id: '403 · DILARANG', en: '403 · FORBIDDEN' },
    langNote: {
      id: 'Bahasa dipilih sebelumnya · tersimpan di perangkat ini',
      en: 'Language chosen earlier · saved on this device',
    },
  },
  noAccess: {
    title: { id: 'Anda sudah masuk, tetapi belum ditambahkan', en: "You're signed in, but not added yet" },
    supervisor: {
      id: 'Minta admin BPBD memberi peran supervisor pada {email}, lalu periksa lagi.',
      en: 'Ask a BPBD admin to give {email} the supervisor role, then check again.',
    },
    volunteer: {
      id: 'Minta admin BPBD memberi peran relawan pada {email}, lalu periksa lagi.',
      en: 'Ask a BPBD admin to give {email} the volunteer role, then check again.',
    },
    code: { id: '403 · ROLE_MISSING', en: '403 · ROLE_MISSING' },
    checkAgain: { id: 'Periksa lagi', en: 'Check again' },
  },
  notFound: {
    title: { id: 'Halaman tidak ditemukan', en: 'Page not found' },
    body: { id: '{path} tidak ada.', en: "{path} doesn't exist." },
    code: { id: '404 · TIDAK DITEMUKAN', en: '404 · NOT FOUND' },
    toVolunteer: { id: 'Buka aplikasi relawan', en: 'Go to the volunteer app' },
    toConsole: { id: 'Buka konsol', en: 'Go to the console' },
  },
  loadFailed: {
    title: { id: 'Halaman gagal dimuat', en: 'This page could not load' },
    body: {
      id: 'Periksa koneksi Anda lalu muat ulang. Laporan yang belum terkirim tetap tersimpan di ponsel.',
      en: 'Check your connection and reload. Reports that have not been sent stay saved on your phone.',
    },
    action: { id: 'Muat ulang', en: 'Reload' },
  },
  checking: { id: 'Memeriksa akun…', en: 'Checking sign-in…' },
  signOut: { id: 'Keluar', en: 'Sign out' },
} as const

/** Fills `{email}` / `{path}` placeholders in static copy. */
export function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(value),
    template,
  )
}

/** Turns the raw Firebase pop-up errors into plain wording; other messages pass through. */
export function signInErrorText(message: string, lang: Lang): string {
  if (/popup-closed-by-user|cancelled-popup-request|user-cancelled/.test(message)) {
    return copy.signIn.cancelled[lang]
  }
  if (/popup-blocked/.test(message)) {
    return copy.signIn.blocked[lang]
  }
  return message
}

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
  supervisorSignup: {
    join: { id: 'Bergabung sebagai Supervisor', en: 'Join as Supervisor' },
    title: { id: 'Buat akun supervisor', en: 'Create a supervisor account' },
    body: { id: 'Daftar dengan Google untuk mendapatkan peran supervisor dan membuka konsol.', en: 'Sign up with Google to receive the supervisor role and open the console.' },
    google: { id: 'Daftar dengan Google', en: 'Sign up with Google' },
    back: { id: 'Kembali ke halaman masuk', en: 'Back to sign in' },
    changeAccount: { id: 'Gunakan akun Google lain', en: 'Use another Google account' },
  },
  signIn: {
    volunteer: {
      title: { id: 'Masuk ke EMBER', en: 'Sign in to EMBER' },
    },
    supervisor: {
      title: { id: 'Masuk ke Konsol Supervisor', en: 'Sign in to the Supervisor Console' },
      sub: {
        id: 'Masuk atau buat akun supervisor BPBD.',
        en: 'Sign in or create a BPBD supervisor account.',
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
    tryAgain: { id: 'Coba lagi', en: 'Try again' },
  },
  /** The volunteer sign-in frame (02 Sign in) and the states drawn on the same shell. */
  volunteer: {
    tagline: {
      id: 'Melihat kebakaran? Kirim foto atau laporan suara. Supervisor Anda dapat mengoordinasikan bantuan.',
      en: 'Spot a fire? Send a photo or voice report. Your supervisor can coordinate help.',
    },
    newToEmber: { id: 'BARU DI EMBER?', en: 'NEW TO EMBER?' },
    createAccount: { id: 'Buat akun relawan', en: 'Create a volunteer account' },
    demo: { id: 'Demo simulasi · tanpa data nyata', en: 'Simulated demo · no real data' },
    languageLabel: { id: 'Bahasa / English', en: 'Bahasa / English' },
    /** The red card under the tagline when Google sign-in did not finish (frame A1c). */
    signInError: {
      blocked: {
        title: { id: 'Jendela masuk diblokir', en: 'Sign-in window was blocked' },
        body: { id: 'Izinkan pop-up untuk situs ini, lalu coba lagi.', en: 'Allow pop-ups for this site, then try again.' },
      },
      cancelled: {
        title: { id: 'Masuk dibatalkan', en: 'Sign-in was cancelled' },
        body: { id: 'Ketuk Coba lagi untuk membuka jendela Google.', en: 'Tap Try again to open the Google window.' },
      },
      failed: {
        title: { id: 'Tidak bisa masuk saat ini', en: "We couldn't sign you in" },
        body: { id: 'Periksa koneksi Anda lalu coba lagi.', en: 'Check your connection and try again.' },
      },
      deviceVerification: {
        title: { id: 'Kami tidak dapat memverifikasi perangkat ini', en: "We couldn't verify this device" },
        body: {
          id: 'Verifikasi keamanan gagal. Jika terus terjadi, beri tahu supervisor Anda.',
          en: 'The security check failed. If this keeps happening, tell your supervisor.',
        },
      },
    },
    deviceNotVerified: {
      title: { id: 'Kami tidak dapat memverifikasi perangkat ini', en: "We couldn't verify this device" },
      body: {
        id: 'Muat ulang aplikasi. Jika terus terjadi, beri tahu supervisor Anda — laporan tidak bisa dikirim sampai ini teratasi.',
        en: "Reload the app. If it keeps happening, tell your supervisor — reports can't be sent until this clears.",
      },
      code: { id: '403 · APP CHECK', en: '403 · APP CHECK' },
      action: { id: 'Muat ulang', en: 'Reload' },
    },
    sessionExpired: {
      title: { id: 'Silakan masuk lagi', en: 'Please sign in again' },
      body: {
        id: 'Sesi Anda berakhir. Laporan yang antre tetap ada di ponsel ini dan terkirim setelah Anda masuk.',
        en: 'Your session ended. Queued reports stay on this phone and send after you sign in.',
      },
      code: { id: '401 · UNAUTHORIZED', en: '401 · UNAUTHORIZED' },
    },
    accountCheckFailed: {
      title: { id: 'Kami tidak dapat memeriksa akun Anda', en: "We couldn't check your account" },
      body: {
        id: 'Periksa koneksi Anda lalu coba lagi. Laporan yang antre tetap ada di ponsel ini.',
        en: 'Check your connection and try again. Queued reports stay on this phone.',
      },
    },
    notFoundBody: {
      id: 'Tautan ini tidak mengarah ke mana pun di EMBER.',
      en: "This link doesn't go anywhere in EMBER.",
    },
  },
  roleChoice: {
    title: { id: 'Bagaimana Anda akan membantu hari ini?', en: 'How will you help today?' },
    sub: { id: 'Pilih peran Anda. Kami akan mengingatnya di ponsel ini.', en: 'Choose your role. We’ll remember this on this phone.' },
    language: { id: 'Bahasa', en: 'Language' },
    volunteer: {
      title: { id: 'Saya relawan', en: "I'm a volunteer" },
      desc: { id: 'Laporkan kebakaran dan terima tugas dari regu Anda.', en: 'Report fires and receive tasks from your team.' },
    },
    supervisor: {
      title: { id: 'Saya supervisor', en: "I'm a supervisor" },
      desc: { id: 'BPBD: tinjau laporan, koordinasikan bantuan.', en: 'BPBD: review reports, coordinate help.' },
    },
  },
  wrongRole: {
    volunteerOnSupervisorPage: {
      title: { id: 'Halaman ini untuk supervisor', en: 'This page is for supervisors' },
      body: {
        id: 'Akun Anda terdaftar sebagai relawan. Buka aplikasi relawan untuk melapor.',
        en: 'Your account is registered as a volunteer. Open the volunteer app to report.',
      },
      action: { id: 'Buka aplikasi relawan', en: 'Open the volunteer app' },
    },
    supervisorOnVolunteerPage: {
      title: { id: 'Halaman ini untuk relawan', en: 'This page is for volunteers' },
      body: {
        id: 'Akun Anda terdaftar sebagai supervisor. Buka konsol untuk meninjau insiden.',
        en: 'Your account is registered as a supervisor. Open the console to review incidents.',
      },
      action: { id: 'Buka konsol', en: 'Open the console' },
    },
    /** Printed with the requested path, as in `403 · FORBIDDEN · /CONSOLE`. */
    code: { id: '403 · FORBIDDEN', en: '403 · FORBIDDEN' },
  },
  noAccess: {
    title: { id: 'Anda sudah masuk, tetapi belum ditambahkan', en: "You're signed in, but not added yet" },
    supervisor: {
      id: 'Minta admin BPBD memberi peran supervisor pada {email}, lalu periksa lagi.',
      en: 'Ask a BPBD admin to give {email} the supervisor role, then check again.',
    },
    volunteer: {
      id: 'Minta supervisor BPBD Anda menambahkan {email} sebagai relawan. Lalu ketuk Periksa lagi.',
      en: 'Ask your BPBD supervisor to add {email} as a volunteer. Then tap Check again.',
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

/** The volunteer sees a titled card, never the raw message: a pop-up error is mapped, anything else gets the generic one. */
export function volunteerSignInError(message: string, lang: Lang): { title: string; body: string } {
  const text = copy.volunteer.signInError
  const card = /appCheck\//i.test(message)
    ? text.deviceVerification
    : /popup-blocked/.test(message)
    ? text.blocked
    : /popup-closed-by-user|cancelled-popup-request|user-cancelled/.test(message)
      ? text.cancelled
      : text.failed
  return { title: card.title[lang], body: card.body[lang] }
}

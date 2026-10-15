/** Permission row copy (#76). Bahasa Indonesia default; DRAFT, needs native-speaker review. */
import type { PermKey, PermState, Platform } from './permState'

type Leaf = { readonly id: string; readonly en: string }

export const permStrings = {
  asking: { id: 'Meminta…', en: 'Asking' },
  allowed: { id: '✓ Diizinkan', en: '✓ Allowed' },
  blocked: { id: 'Diblokir', en: 'Blocked' },
  notSupported: { id: 'Tidak didukung', en: 'Not supported' },
  /** Second line of each row, by permission and state. Denied rows show the steps instead. */
  hint: {
    microphone: {
      prompt: { id: 'Dibutuhkan untuk bicara', en: 'Needed for push-to-talk' },
      asking: { id: 'Periksa permintaan di browser', en: 'Check the browser prompt' },
      granted: { id: 'Siap dipakai', en: 'Ready to use' },
    },
    camera: {
      prompt: { id: 'Video langsung dan foto', en: 'Live video and photos' },
      asking: { id: 'Periksa permintaan di browser', en: 'Check the browser prompt' },
      granted: { id: 'Siap dipakai', en: 'Ready to use' },
    },
    location: {
      prompt: { id: 'Disertakan di setiap laporan', en: 'Attached to every report' },
      asking: { id: 'Periksa permintaan di browser', en: 'Check the browser prompt' },
      granted: { id: 'Disertakan di setiap laporan', en: 'Attached to every report' },
    },
    notifications: {
      prompt: { id: 'Peringatan tugas baru dan MUNDUR', en: 'Alerts for new tasks and WITHDRAW' },
      asking: { id: 'Periksa permintaan di browser', en: 'Check the browser prompt' },
      granted: { id: 'Peringatan aktif', en: 'Alerts are on' },
    },
  },
  unsupportedHint: { id: 'Browser ini tidak mendukungnya', en: "This browser doesn't support it" },
  /** Per-platform steps shown when a permission is blocked. */
  steps: {
    other: {
      microphone: { id: 'Pengaturan situs → Mikrofon → Izinkan', en: 'Site settings → Microphone → Allow' },
      camera: { id: 'Pengaturan situs → Kamera → Izinkan', en: 'Site settings → Camera → Allow' },
      location: { id: 'Pengaturan situs → Lokasi → Izinkan', en: 'Site settings → Location → Allow' },
      notifications: { id: 'Pengaturan situs → Notifikasi → Izinkan', en: 'Site settings → Notifications → Allow' },
    },
    android: {
      microphone: { id: 'Ketuk ikon gembok → Izin → Mikrofon → Izinkan', en: 'Tap the lock icon → Permissions → Microphone → Allow' },
      camera: { id: 'Ketuk ikon gembok → Izin → Kamera → Izinkan', en: 'Tap the lock icon → Permissions → Camera → Allow' },
      location: { id: 'Ketuk ikon gembok → Izin → Lokasi → Izinkan', en: 'Tap the lock icon → Permissions → Location → Allow' },
      notifications: { id: 'Ketuk ikon gembok → Izin → Notifikasi → Izinkan', en: 'Tap the lock icon → Permissions → Notifications → Allow' },
    },
    ios: {
      microphone: { id: 'Pengaturan → Safari → Mikrofon → Izinkan', en: 'Settings → Safari → Microphone → Allow' },
      camera: { id: 'Pengaturan → Safari → Kamera → Izinkan', en: 'Settings → Safari → Camera → Allow' },
      location: { id: 'Pengaturan → Privasi → Layanan Lokasi → Safari', en: 'Settings → Privacy → Location Services → Safari' },
      notifications: { id: 'Pengaturan → Notifikasi → EMBER → Izinkan', en: 'Settings → Notifications → EMBER → Allow' },
    },
  },
  summary: (ready: number, total: number): Leaf => ({ id: `${ready} dari ${total} siap`, en: `${ready} of ${total} ready` }),
  pushOff: {
    id: 'notifikasi mati, tugas tetap muncul saat aplikasi terbuka',
    en: 'notifications are off, tasks still show while the app is open',
  },
  allowLabel: (name: string): Leaf => ({ id: `Izinkan ${name}`, en: `Allow ${name}` }),
} as const

export function permHint(key: PermKey, state: PermState | 'asking', platform: Platform): Leaf {
  if (state === 'denied') return permStrings.steps[platform][key]
  if (state === 'unsupported') return permStrings.unsupportedHint
  return permStrings.hint[key][state]
}

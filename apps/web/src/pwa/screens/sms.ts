import type { DevicePosition } from './arrival'

export type SmsKind = 'help' | 'safe' | 'spreading'

/** The words an SMS starts with. Always Bahasa: the people who read it are in the crew and on the duty line. */
export const SMS_KINDS: Record<SmsKind, string> = {
  help: 'BUTUH BANTUAN',
  safe: 'AMAN',
  spreading: 'API MENYEBAR',
}

const two = (n: number) => String(n).padStart(2, '0')

/** "14:44", the phone's own clock, like every other time in the app. */
function clock(d: Date): string {
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

/**
 * The text of the fallback SMS. Everything in it is what the phone knows right now: the volunteer's name, the
 * incident code when the last digest had one, the time, and the GPS fix when there is one. It never invents a
 * position; with no fix it says so.
 */
export function buildSms(input: { kind: SmsKind; name: string | null; incidentCode: string | null; at: Date; position: DevicePosition }): string {
  const place =
    input.position.kind === 'ok'
      ? `${input.position.lat.toFixed(4)}, ${input.position.lng.toFixed(4)} (±${input.position.accuracyM} M)`
      : 'LOKASI TIDAK TERSEDIA'
  return [
    `EMBER ${SMS_KINDS[input.kind]}`,
    input.name?.trim() ? input.name.trim().toUpperCase() : null,
    input.incidentCode?.trim() ? input.incidentCode.trim().toUpperCase() : null,
    clock(input.at),
    place,
    'TIDAK ADA SINYAL DATA.',
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * `sms:` link that opens the phone's own SMS app with the text filled in. `?&body=` is read by both Android and
 * iOS. With recipients it is `sms:a,b?&body=`; without any the volunteer picks who to send to.
 */
export function smsHref(body: string, recipients: string[] = []): string {
  const to = recipients.map((r) => r.replace(/[^\d+]/g, '')).filter(Boolean).join(',')
  return `sms:${to}?&body=${encodeURIComponent(body)}`
}

/** The incident code is the first part of an incident name, before " · ". */
export function incidentCodeOf(name: string | null | undefined): string | null {
  const first = name?.split(' · ')[0]?.trim()
  return first ? first : null
}

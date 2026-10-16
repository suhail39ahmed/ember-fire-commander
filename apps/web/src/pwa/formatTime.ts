/**
 * Clock time as HH:mm on a 24-hour clock in the phone's time zone, for example "14:12".
 * Every screen uses this one function, so the same report shows the same time in both
 * languages. Call it when rendering, not when the report is sent, so it never goes stale.
 */
export function formatTime(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '--:--'
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

function zoneLabel(d: Date): string {
  const part = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')
  return part?.value ?? ''
}

/** "17:07 GMT+5:30": the time in the viewer's time zone with the zone named, so a reader never has to guess. */
export function formatTimeZone(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '--:--'
  const zone = zoneLabel(d)
  return zone ? `${formatTime(d)} ${zone}` : formatTime(d)
}

/** "16 Oct 2026, 17:07 GMT+5:30": the full date and time in the viewer's time zone. */
export function formatDateTime(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '--:--'
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${date}, ${formatTimeZone(d)}`
}

/** "16 Oct 2026": the calendar day in the viewer's time zone. Used to group rows by day. */
export function formatDay(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

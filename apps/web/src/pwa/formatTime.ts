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

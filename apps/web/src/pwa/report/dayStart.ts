/**
 * The start of the phone's local day as an ISO time with its zone, such as "2026-10-17T00:00:00+05:30". ember-api reads
 * it as `sentSince` (contract section 6.4) so "today" is the volunteer's day, not the server's.
 */
export function startOfLocalDay(now: Date = new Date()): string {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const two = (n: number) => String(n).padStart(2, '0')
  const offset = -start.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${start.getFullYear()}-${two(start.getMonth() + 1)}-${two(start.getDate())}T00:00:00${sign}${two(Math.floor(abs / 60))}:${two(abs % 60)}`
}

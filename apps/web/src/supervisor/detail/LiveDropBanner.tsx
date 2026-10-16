import { formatTime } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import type { LiveSeat } from '../contracts'
import { liveCopy } from './liveCopy'

/**
 * Orange strip when the live seat was freed after a drop. Hidden when there is
 * no lastDrop (seat never dropped, or data not yet on the detail read).
 */
export function LiveDropBanner({ lang, seat }: { lang: Lang; seat: LiveSeat | null | undefined }) {
  const drop = seat?.lastDrop
  if (!drop || !drop.at) return null
  const who = drop.volunteerName?.trim() || drop.volunteerId.slice(-4).toUpperCase()
  const when = formatTime(drop.at)
  const signal = drop.signal.toUpperCase()
  return (
    <div className="live-drop" role="status">
      <p className="live-drop-title">
        {who} · {t(lang, liveCopy.dropTitle)} {t(lang, liveCopy.droppedAt)} {when}.
        {' '}{t(lang, liveCopy.signalFell)} {signal}.
      </p>
      <p className="live-drop-body">{t(lang, liveCopy.dropBody)}</p>
      <p className="live-drop-seat">
        {seat.status === 'held'
          ? `${t(lang, liveCopy.seatHeld)} ${seat.holderName?.trim() || seat.holderId || '—'}`
          : t(lang, liveCopy.seatFree)}
      </p>
    </div>
  )
}

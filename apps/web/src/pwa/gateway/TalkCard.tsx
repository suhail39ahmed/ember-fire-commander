import { t, type Lang } from '../i18n'
import type { TalkView } from './voiceView'
import './talk.css'

function PttIcon({ button }: { button: TalkView['button'] }) {
  switch (button) {
    case 'ready':
      return <span className="ptt-dot" aria-hidden="true" />
    case 'listening':
      return (
        <span className="ptt-wave" aria-hidden="true">
          <i /><i /><i /><i /><i />
        </span>
      )
    case 'unavailable':
      return (
        <svg className="ptt-mic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      )
    default:
      return <span className="ptt-spinner" aria-hidden="true" />
  }
}

/**
 * Hold to talk and its status line. The button and the line come from one TalkView,
 * and the line has reserved height, so nothing moves when the state changes (#74).
 */
export function TalkCard({
  lang,
  view,
  onPress,
  onRelease,
}: {
  lang: Lang
  view: TalkView
  onPress: () => void
  onRelease: () => void
}) {
  return (
    <section className="card talk">
      <button
        type="button"
        className={`btn ink ptt ptt-${view.button}`}
        data-state={view.button}
        disabled={view.disabled}
        aria-describedby="ptt-status"
        onPointerDown={onPress}
        onPointerUp={onRelease}
        onPointerLeave={onRelease}
        onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && onPress()}
        onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && onRelease()}
      >
        <PttIcon button={view.button} />
        <span className="ptt-label">{t(lang, view.label)}</span>
      </button>
      <p id="ptt-status" className="ptt-status" data-state={view.button} aria-live="polite">
        {t(lang, view.status)}
      </p>
    </section>
  )
}

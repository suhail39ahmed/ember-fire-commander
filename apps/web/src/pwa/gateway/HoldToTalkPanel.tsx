import { t, type Lang } from '../i18n'
import type { TalkView } from './voiceView'
import { TalkCard } from './TalkCard'
import { gatewayStrings } from './gatewayStrings'
import './talk.css'

/**
 * Hold to talk (#129). Reuses TalkCard; when listening, shows the live frame chrome.
 * Transcript text is only shown when the gateway already sent one — never invented.
 */
export function HoldToTalkPanel({
  lang,
  view,
  transcript,
  onPress,
  onRelease,
}: {
  lang: Lang
  view: TalkView
  transcript: string | null
  onPress: () => void
  onRelease: () => void
}) {
  const listening = view.button === 'listening' || view.button === 'connecting'
  return (
    <section className={`hold-panel${listening ? ' hold-live' : ''}`} data-testid="hold-to-talk">
      {listening && (
        <div className="hold-camera" aria-hidden="true">
          <div className="hold-camera-ring" />
          <p className="hold-camera-label">{t(lang, gatewayStrings.liveCamera)}</p>
        </div>
      )}
      {listening && (
        <p className="hold-transcript" data-testid="hold-transcript" aria-live="polite">
          {transcript ?? t(lang, gatewayStrings.listeningHint)}
        </p>
      )}
      <TalkCard lang={lang} view={view} onPress={onPress} onRelease={onRelease} />
      {listening && <p className="muted small hold-hint">{t(lang, gatewayStrings.releaseHint)}</p>}
      {view.button === 'unavailable' && (
        <p className="muted small" data-testid="hold-unavailable">
          {t(lang, gatewayStrings.unavailableHint)}
        </p>
      )}
    </section>
  )
}

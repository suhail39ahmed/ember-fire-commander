import { t, type Lang } from '../i18n'
import type { TalkView } from './voiceView'
import { TalkCard } from './TalkCard'
import { gatewayStrings } from './gatewayStrings'
import './talk.css'

/**
 * Hold to talk (#129). Reuses TalkCard. While listening, the live transcript card sits above the button.
 * Transcript text is only shown when the gateway already sent one — never invented. The camera is the panel
 * above this one on the Report tab, so there is no camera stand-in here.
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
        <div className="hold-transcript" data-testid="hold-transcript" aria-live="polite">
          {transcript && <p className="hold-transcript-label">{t(lang, gatewayStrings.youTranscript)}</p>}
          <p className={transcript ? 'hold-transcript-text' : 'hold-transcript-text hold-transcript-empty'}>
            {transcript ? `“${transcript}”` : t(lang, gatewayStrings.listeningHint)}
          </p>
        </div>
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

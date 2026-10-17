import { useState } from 'react'

import { formatTimeZone } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import type { AskAnswer, DetailSuggestions, Translation } from '../contracts'
import { assistCopy } from './assistCopy'
import { popupCopy } from './popupCopy'
import { ASK_MAX, assistProblem, languageName, worthShowing, type AssistActions } from './assistModel'
import './assist.css'

/** Suggestions for the incident, written by a model from stored data. They send nothing and decide nothing. */
export function IncidentSuggestions({ lang, suggestions, assist, offline }: { lang: Lang; suggestions: DetailSuggestions | null | undefined; assist: AssistActions; offline: boolean }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function make() {
    if (busy || offline) return
    setBusy(true)
    setProblem(null)
    try {
      await assist.suggest()
    } catch (error) {
      setProblem(assistProblem(lang, error))
    } finally {
      setBusy(false)
    }
  }

  const source = suggestions?.source === 'model' ? assistCopy.fromModel : suggestions?.source === 'template' ? assistCopy.fromRules : null
  return (
    <section className="inc-card" aria-labelledby="inc-suggest-title">
      <h2 className="inc-h2" id="inc-suggest-title">
        {t(lang, assistCopy.title)}
        <span className="inc-h2-note">{t(lang, assistCopy.note)}</span>
      </h2>
      {!suggestions ? (
        <p className="inc-muted">{t(lang, assistCopy.none)}</p>
      ) : suggestions.items.length === 0 ? (
        <p className="inc-muted">{t(lang, assistCopy.empty)}</p>
      ) : (
        <ul className="ast-list">
          {suggestions.items.map((item, i) => (
            <li key={`${i}-${item.text}`} className="ast-item">
              <p className="ast-text">{item.text}</p>
              {item.rationale && <p className="inc-muted">{t(lang, assistCopy.why)}: {item.rationale}</p>}
            </li>
          ))}
        </ul>
      )}
      {suggestions && (suggestions.generatedAt || source) && (
        <p className="inc-muted">
          {suggestions.generatedAt && `${t(lang, assistCopy.madeAt)} ${formatTimeZone(suggestions.generatedAt)}`}
          {suggestions.generatedAt && source && ' · '}
          {source && t(lang, source)}
        </p>
      )}
      <div className="ast-actions">
        <button type="button" className="inc-btn" disabled={busy || offline} onClick={() => void make()}>
          {busy ? t(lang, assistCopy.working) : t(lang, suggestions ? assistCopy.refresh : assistCopy.make)}
        </button>
      </div>
      {problem && <p className="ast-error" role="alert">{problem}</p>}
      <p className="inc-muted">{t(lang, assistCopy.decide)}</p>
    </section>
  )
}

/** Ask EMBER about one volunteer. The answer is advice text from stored data and changes nothing. */
export function AskBox({ lang, volunteerId, assist, offline }: { lang: Lang; volunteerId: string; assist: AssistActions; offline: boolean }) {
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<AskAnswer | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const trimmed = question.trim()
  const tooLong = trimmed.length > ASK_MAX

  /** Asks `text` when given (a quick prompt), else what is typed in the box. A prompt fills the box so the question stays visible. */
  async function submit(text?: string) {
    const asked = (text ?? question).trim()
    if (busy || offline || asked === '' || asked.length > ASK_MAX) return
    if (text !== undefined) setQuestion(asked)
    setBusy(true)
    setProblem(null)
    try {
      setAnswer(await assist.ask(asked, volunteerId))
    } catch (error) {
      setAnswer(null)
      setProblem(assistProblem(lang, error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="pop-prompts">
        {[popupCopy.promptNext, popupCopy.promptRecap, popupCopy.promptAll].map((label) => (
          <button key={label.en} type="button" className="pop-btn" disabled={busy || offline} onClick={() => void submit(t(lang, label))}>
            {t(lang, label)}
          </button>
        ))}
      </div>
      <div className="ast-ask">
        <input
          className="pop-input"
          value={question}
          maxLength={ASK_MAX + 50}
          placeholder={t(lang, assistCopy.askPlaceholder)}
          aria-label={t(lang, assistCopy.askLabel)}
          disabled={busy || offline}
          onChange={(e) => { setQuestion(e.target.value); setProblem(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
        />
        <button type="button" className="pop-btn pop-send" disabled={busy || offline || trimmed === '' || tooLong} onClick={() => void submit()}>
          {busy ? t(lang, assistCopy.asking) : t(lang, assistCopy.askBtn)}
        </button>
      </div>
      <p className="pop-gap">{ASK_MAX - trimmed.length} {t(lang, assistCopy.askLimit)}</p>
      {answer && (
        <div className="ast-answer" role="status">
          <p className="pop-line-meta">{t(lang, assistCopy.answer)} · {formatTimeZone(answer.at)}</p>
          <p className="pop-line-text">{answer.answer}</p>
          {answer.enoughData === false && <p className="pop-gap">{t(lang, assistCopy.notEnough)}</p>}
        </div>
      )}
      {problem && <p className="pop-error pop-result" role="alert">{problem}</p>}
      <p className="pop-gap">{t(lang, assistCopy.askRule)}</p>
    </>
  )
}

/** The English text under a volunteer's own words, or a button to ask for it. The original is never replaced. */
export function TranslationLine({ lang, translation, observationId, hasText, assist, offline }: { lang: Lang; translation: Translation | undefined; observationId: string; hasText: boolean; assist: AssistActions | undefined; offline: boolean }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  if (worthShowing(translation)) {
    const from = languageName(lang, translation.sourceLanguage)
    return (
      <p className="ast-english">
        <span className="pop-line-meta">{t(lang, assistCopy.english)}{from && ` · ${t(lang, assistCopy.translatedFrom)} ${from}`}</span>
        <br />
        “{translation.english}”
      </p>
    )
  }
  if (translation || !hasText || !assist) return null

  async function run() {
    if (!assist || busy || offline) return
    setBusy(true)
    setProblem(null)
    try {
      await assist.translate(observationId)
    } catch (error) {
      setProblem(assistProblem(lang, error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ast-translate">
      <button type="button" className="pop-btn" disabled={busy || offline} onClick={() => void run()}>
        {busy ? t(lang, assistCopy.translating) : t(lang, assistCopy.translate)}
      </button>
      {problem && <p className="pop-error pop-result" role="alert">{problem}</p>}
    </div>
  )
}

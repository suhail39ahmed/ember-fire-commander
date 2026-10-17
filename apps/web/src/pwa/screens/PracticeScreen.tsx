import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { PracticeAnswer, PracticeResponse } from '../contracts/types'
import { t } from '../i18n'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { PracticeComposer } from './PracticeComposer'
import { practiceSafety } from './practiceSafety'
import { screenStrings } from './strings'
import './guide.css'

export function PracticeScreen() {
  const { lang } = useLanguage()
  const { api, outbox: { online } } = useVolunteer()
  const [params] = useSearchParams()
  const initial = params.get('q') || ''
  const lessonId = params.get('lesson') || undefined
  const [question, setQuestion] = useState(initial)
  const [replyLang, setReplyLang] = useState(lang)
  const [result, setResult] = useState<PracticeResponse | null>(null)
  const [answer, setAnswer] = useState<PracticeAnswer | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const lifecycle = useRef({ busy: false, version: 0 }).current
  const initialRequest = useRef<{ key: string; promise: Promise<PracticeResponse> } | null>(null)
  const s = screenStrings.practice
  const lessonPrompt = lessonId && s.lessonPrompts[lessonId as keyof typeof s.lessonPrompts]
  const initialPrompt = initial || t(lang, lessonPrompt || s.startLessonPrompt)
  useEffect(() => { setReplyLang(lang) }, [lang])
  async function send(text: string, nextLang = lang, previousTurnId?: string) {
    if (!online || lifecycle.busy || !text.trim()) return
    lifecycle.busy = true; setBusy(true); setError(false)
    const version = ++lifecycle.version
    try {
      const next = await api.askPractice({ message: text.trim(), lang: nextLang, lessonId, previousTurnId })
      if (version !== lifecycle.version) return
      setQuestion(text); setResult(next); setAnswer(null); setSelected(null); setReplyLang(nextLang)
    } catch { if (version === lifecycle.version) setError(true) }
    finally { if (version === lifecycle.version) { setBusy(false); lifecycle.busy = false } }
  }
  useEffect(() => {
    window.scrollTo(0, 0)
    if (!online) return
    const version = ++lifecycle.version
    const key = `${lessonId}:${initial}`
    if (initialRequest.current?.key !== key) {
      initialRequest.current = { key, promise: api.askPractice({ message: initialPrompt, lang, lessonId }) }
    }
    lifecycle.busy = true; setBusy(true); setError(false)
    void initialRequest.current.promise.then((next) => {
      if (version === lifecycle.version) { setResult(next); setQuestion(initialPrompt); setSelected(null); setAnswer(null); setReplyLang(lang) }
    }).catch(() => { if (version === lifecycle.version) setError(true) })
      .finally(() => { if (version === lifecycle.version) { lifecycle.busy = false; setBusy(false) } })
    return () => { lifecycle.version++; lifecycle.busy = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial request follows the route, never a language toggle
  }, [initial, lessonId])
  async function choose(optionId: string) {
    if (!result || !online || lifecycle.busy || answer) return
    lifecycle.busy = true; setBusy(true); setError(false)
    const version = lifecycle.version
    try { const graded = await api.answerPractice(result.turnId, optionId); if (version === lifecycle.version) { setSelected(optionId); setAnswer(graded) } }
    catch { if (version === lifecycle.version) setError(true) }
    finally { if (version === lifecycle.version) { lifecycle.busy = false; setBusy(false) } }
  }
  return <section className="practice" data-testid="practice-screen">
    <Link className="practice-back" to="/pwa/guide">← {t(lang, screenStrings.guide.title)}</Link>
    <h2>{t(lang, s.title)}</h2><p className="practice-badge">{t(lang, s.badge)}</p>
    {question && <p className="practice-question">{question}</p>}
    {result && <>
      <div className="practice-coach" lang={replyLang}><span className="practice-avatar" aria-hidden="true">AI</span><div><p>{t(replyLang, result.reply)}</p>{result.ruleKey && practiceSafety[result.ruleKey] && <p className="practice-rule">{t(replyLang, practiceSafety[result.ruleKey])}</p>}</div></div>
      {result.check && <div className="practice-coach"><span className="practice-avatar" aria-hidden="true">AI</span><section className="practice-check">
        <p className="practice-check-label">{t(lang, s.check)} · {result.check.index} {t(lang, screenStrings.guide.ofLower)} {result.check.total}</p>
        <h3 lang={replyLang}>{t(replyLang, result.check.question)}</h3>
        <div className="practice-options" lang={replyLang}>{result.check.options.map((option, index) => <button key={option.id} type="button" className={`practice-option${selected === option.id ? answer?.correct ? ' is-right' : ' is-wrong' : ''}`} disabled={busy || !online || !!answer} aria-pressed={selected === option.id} onClick={() => void choose(option.id)}><span aria-hidden="true">{selected === option.id ? answer?.correct ? '✓' : '×' : index + 1}</span>{t(replyLang, option.label)}</button>)}</div>
        {answer && <p className={`practice-feedback ${answer.correct ? 'is-right' : 'is-wrong'}`} role="status" lang={replyLang}>{t(replyLang, answer.feedback)}</p>}
      </section></div>}
      <div className="practice-actions">
        {answer && !answer.lessonComplete && result.check && result.check.index < result.check.total && <button type="button" className="guide-chip" disabled={busy || !online} onClick={() => void send(question, replyLang, result.turnId)}>{t(lang, s.next)}</button>}
        {answer?.lessonComplete && <Link className="guide-chip" to="/pwa/guide">{t(lang, s.lessonComplete)}</Link>}
        {answer && !answer.lessonComplete && result.check?.index === result.check?.total && <button type="button" className="guide-chip" disabled={busy || !online} onClick={() => void send(question)}>{t(lang, s.tryAgain)}</button>}
        <button type="button" className="guide-chip" disabled={busy || !online} onClick={() => void send(question || initial || t(lang, s.startLessonPrompt), replyLang === 'en' ? 'id' : 'en')}>{t(lang, replyLang === 'en' ? s.askBahasa : s.askEnglish)}</button>
      </div>
    </>}
    {busy && <p className="muted small" role="status">{t(lang, s.sending)}</p>}
    {!online && <p className="muted small" role="status">{t(lang, s.needsSignal)}</p>}
    {error && <p className="error" role="alert">{t(lang, s.failed)} <button type="button" className="guide-text-button" onClick={() => void send(question || initial || t(lang, s.startLessonPrompt))}>{t(lang, screenStrings.guide.retry)}</button></p>}
    <PracticeComposer lang={lang} placeholder={t(lang, s.placeholder)} disabled={busy || !online} onSend={(text) => void send(text)} />
  </section>
}

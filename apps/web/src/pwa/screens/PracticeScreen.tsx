import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import type { PracticeResponse } from '../contracts/types'
import { t } from '../i18n'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { screenStrings } from './strings'

/** Practice with EMBER (#154). Never opens the live incident voice socket or POST /observations. */
export function PracticeScreen() {
  const { lang } = useLanguage()
  const { api } = useVolunteer()
  const [params] = useSearchParams()
  const initial = params.get('q') || ''
  const lessonId = params.get('lesson')
  const [message, setMessage] = useState(initial)
  const [result, setResult] = useState<PracticeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const s = screenStrings.practice

  useEffect(() => {
    if (!initial && !lessonId) return
    void send(initial || t(lang, s.startLessonPrompt), lessonId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for deep link
  }, [])

  async function send(text: string, lesson?: string | null, optionId?: string) {
    if (!text.trim() && !optionId) return
    setBusy(true)
    setError(null)
    try {
      const next = await api.practiceTurn({
        message: text.trim() || t(lang, s.startLessonPrompt),
        lessonId: lesson || undefined,
        optionId,
      })
      setResult(next)
      if (optionId && lesson && next.correct) {
        await api.saveTrainingProgress({ lessonId: lesson, status: 'done', score: 1 })
      } else if (lesson && !optionId) {
        await api.saveTrainingProgress({ lessonId: lesson, status: 'in_progress' })
      }
    } catch {
      setError(t(lang, s.failed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="practice" data-testid="practice-screen">
      <p className="practice-badge">{t(lang, s.badge)}</p>
      <h2>{t(lang, s.title)}</h2>
      <p className="muted">{t(lang, s.subtitle)}</p>

      {result?.safetyLines && (
        <ul className="practice-safety">
          {result.safetyLines.map((line, i) => (
            <li key={i}>{line[lang] || line.en}</li>
          ))}
        </ul>
      )}

      {result && (
        <div className={`card practice-reply${result.correct === true ? ' ok' : result.correct === false ? ' bad' : ''}`}>
          <p>{result.reply[lang] || result.reply.en}</p>
          {result.correct === true && <p className="muted small">{t(lang, s.right)}</p>}
          {result.correct === false && <p className="muted small">{t(lang, s.wrong)}</p>}
        </div>
      )}

      {result?.check && (
        <div className="card">
          <p className="section-label">{t(lang, s.check)}</p>
          <p>{result.check.question[lang] || result.check.question.en}</p>
          <div className="guide-chips">
            {result.check.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => void send(opt.label[lang] || opt.label.en, result.check?.lessonId, opt.id)}
              >
                {opt.label[lang] || opt.label.en}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="guide-ask-row">
        <input
          className="text-field"
          value={message}
          placeholder={t(lang, s.placeholder)}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="button" className="btn ink" disabled={busy || !message.trim()} onClick={() => void send(message, lessonId)}>
          {busy ? t(lang, s.sending) : t(lang, s.ask)}
        </button>
      </div>
      {error && (
        <p className="nearby-error" role="alert">
          {error}
        </p>
      )}
      <Link className="btn link" to="/pwa/guide">
        {t(lang, s.back)}
      </Link>
    </section>
  )
}

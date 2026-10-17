import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { TrainingPayload } from '../contracts/types'
import { t } from '../i18n'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { PracticeComposer } from './PracticeComposer'
import { TrainingVideo } from './TrainingVideo'
import { screenStrings } from './strings'
import './guide.css'

export function GuideScreen() {
  const { lang } = useLanguage()
  const { api, volunteerId, outbox: { online } } = useVolunteer()
  const navigate = useNavigate()
  const [training, setTraining] = useState<TrainingPayload | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const s = screenStrings.guide
  useEffect(() => { window.scrollTo(0, 0) }, [])
  useEffect(() => {
    let cancelled = false
    setError(false)
    const key = `ember:training:catalog:${volunteerId}`
    void api.getTraining().then((next) => {
      if (cancelled) return
      setTraining(next)
      try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Storage is optional. */ }
    }).catch(() => {
      if (cancelled) return
      try {
        const cached = JSON.parse(localStorage.getItem(key) || 'null') as TrainingPayload | null
        if (cached?.video && Array.isArray(cached.lessons) && Array.isArray(cached.askChips)) { setTraining(cached); return }
      } catch { /* Show the same readable load failure. */ }
      setError(true)
    })
    return () => { cancelled = true }
  }, [api, volunteerId, attempt])
  if (error) return <section className="card"><p role="alert">{t(lang, s.loadFailed)}</p><button type="button" className="btn secondary" onClick={() => setAttempt((value) => value + 1)}>{t(lang, s.retry)}</button></section>
  if (!training) return <p className="muted">{t(lang, screenStrings.common.loading)}</p>
  const startable = training.lessons.find((lesson) => lesson.status !== 'done')?.id
  function openPractice(text: string) { if (online) navigate(`/pwa/guide/practice?q=${encodeURIComponent(text)}`) }
  return <section className="guide" data-testid="guide-screen">
    <h2>{t(lang, s.title)}</h2>
    <p className="muted guide-subtitle">{t(lang, s.subtitle)}</p>
    <TrainingVideo key={`${volunteerId}:${training.video.id}:${training.video.url}`} video={training.video} lang={lang} volunteerId={volunteerId} online={online} save={(videoProgressSec) => api.saveTrainingProgress({ videoProgressSec })} onComplete={() => { if (online) navigate('/pwa/guide/practice?lesson=report_30s') }} />
    <div className="guide-training-head"><h3>{t(lang, s.aiTraining)}</h3><span className="guide-count">{training.doneCount} {t(lang, s.of)} {training.lessonCount} {t(lang, s.done)}</span></div>
    <ol className="guide-lessons">
      {training.lessons.map((lesson, index) => <li key={lesson.id} className={`guide-lesson status-${lesson.status}${lesson.id === startable ? ' is-current' : ''}`}>
        <span className="guide-lesson-n" aria-hidden="true">{lesson.status === 'done' ? '✓' : index + 1}</span>
        <div className="guide-lesson-copy"><strong>{t(lang, lesson.title)}</strong><p className="muted small">{lesson.status === 'done' ? `${t(lang, s.lessonDone)} · ${lesson.score ?? 0} ${t(lang, s.ofLower)} ${lesson.total ?? 3} ${t(lang, s.right)}` : `${lesson.minutes} ${t(lang, s.min)} · ${t(lang, lesson.summary)}`}</p></div>
        {lesson.id === startable && (online ? <Link className="guide-start" to={`/pwa/guide/practice?lesson=${encodeURIComponent(lesson.id)}`}>{t(lang, s.start)}</Link> : <button type="button" className="guide-start" disabled>{t(lang, s.start)}</button>)}
      </li>)}
    </ol>
    <section className="card guide-ask">
      <h3>{t(lang, s.askTitle)}</h3><p className="muted small">{t(lang, s.askBody)}</p>
      <div className="guide-chips">{training.askChips.map((chip) => <button key={chip.id} type="button" className="guide-chip" disabled={!online} onClick={() => openPractice(t(lang, chip.label))}>{t(lang, chip.label)}</button>)}</div>
      <PracticeComposer lang={lang} placeholder={t(lang, s.askPlaceholder)} disabled={!online} onSend={openPractice} />
      {!online && <p className="muted small" role="status">{t(lang, screenStrings.practice.needsSignal)}</p>}
      <p className="guide-footnote">{t(lang, s.practiceOnly)}</p>
    </section>
  </section>
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import type { TrainingLesson, TrainingPayload } from '../contracts/types'
import { t } from '../i18n'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { screenStrings } from './strings'

function lessonLabel(lesson: TrainingLesson, lang: 'id' | 'en') {
  return lesson.title[lang] || lesson.title.en
}

/** Guide tab (#153): training video metadata, lessons, ask chips → practice. */
export function GuideScreen() {
  const { lang } = useLanguage()
  const { api } = useVolunteer()
  const navigate = useNavigate()
  const [training, setTraining] = useState<TrainingPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ask, setAsk] = useState('')
  const s = screenStrings.guide

  useEffect(() => {
    let cancelled = false
    void api
      .getTraining()
      .then((next) => {
        if (!cancelled) setTraining(next)
      })
      .catch(() => {
        if (!cancelled) setError(t(lang, s.loadFailed))
      })
    return () => {
      cancelled = true
    }
  }, [api, lang, s.loadFailed])

  if (error) {
    return (
      <section className="card">
        <p role="alert">{error}</p>
      </section>
    )
  }
  if (!training) {
    return <p className="muted">{t(lang, screenStrings.common.loading)}</p>
  }

  const video = training.video
  const progress = Math.min(100, Math.round(((video.progressSec || 0) / Math.max(1, video.durationSec)) * 100))

  return (
    <section className="guide" data-testid="guide-screen">
      <h2>{t(lang, s.title)}</h2>
      <p className="muted">{t(lang, s.subtitle)}</p>

      <div className="card guide-video">
        <p className="section-label">{t(lang, s.startHere)}</p>
        <div className="guide-video-frame" aria-hidden="true">
          <span className="guide-play" />
        </div>
        <strong>{video.title[lang] || video.title.en}</strong>
        <div className="guide-progress" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </div>
        <p className="muted small">
          {Math.floor((video.progressSec || 0) / 60)}:{String((video.progressSec || 0) % 60).padStart(2, '0')} /{' '}
          {Math.floor(video.durationSec / 60)}:{String(video.durationSec % 60).padStart(2, '0')}
        </p>
        <button
          type="button"
          className="btn secondary"
          onClick={() => void api.saveTrainingProgress({ videoProgressSec: Math.min(video.durationSec, (video.progressSec || 0) + 20) }).then(() => api.getTraining().then(setTraining))}
        >
          {t(lang, s.resumeVideo)}
        </button>
      </div>

      <div className="list-head">
        <h3 className="section-label">{t(lang, s.aiTraining)}</h3>
        <span className="muted small">
          {training.doneCount} {t(lang, s.of)} {training.lessonCount} {t(lang, s.done)}
        </span>
      </div>
      <ul className="guide-lessons">
        {training.lessons.map((lesson, index) => (
          <li key={lesson.id} className={`card guide-lesson status-${lesson.status}`}>
            <span className="guide-lesson-n" aria-hidden="true">
              {lesson.status === 'done' ? '✓' : index + 1}
            </span>
            <div>
              <strong>{lessonLabel(lesson, lang)}</strong>
              <p className="muted small">
                {lesson.minutes} {t(lang, s.min)} · {lesson.summary[lang] || lesson.summary.en}
              </p>
            </div>
            {lesson.status !== 'done' && (
              <Link className="btn ink small" to={`/pwa/guide/practice?lesson=${encodeURIComponent(lesson.id)}`}>
                {t(lang, s.start)}
              </Link>
            )}
          </li>
        ))}
      </ul>

      <section className="card">
        <h3 className="section-label">{t(lang, s.askTitle)}</h3>
        <p className="muted">{t(lang, s.askBody)}</p>
        <div className="guide-chips">
          {training.askChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="chip"
              onClick={() => navigate(`/pwa/guide/practice?q=${encodeURIComponent(chip.label[lang] || chip.label.en)}`)}
            >
              {chip.label[lang] || chip.label.en}
            </button>
          ))}
        </div>
        <div className="guide-ask-row">
          <input
            className="text-field"
            value={ask}
            placeholder={t(lang, s.askPlaceholder)}
            onChange={(e) => setAsk(e.target.value)}
          />
          <button
            type="button"
            className="btn ink"
            disabled={!ask.trim()}
            onClick={() => navigate(`/pwa/guide/practice?q=${encodeURIComponent(ask.trim())}`)}
          >
            {t(lang, s.ask)}
          </button>
        </div>
        <p className="muted small">{t(lang, s.practiceOnly)}</p>
      </section>
    </section>
  )
}

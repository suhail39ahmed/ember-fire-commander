import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { createMockApi } from '../api/mock'
import { youtubeId } from '../screens/trainingVideoUrl'
import { practiceSafety } from '../screens/practiceSafety'
import { TrainingVideo } from '../screens/TrainingVideo'
import { PracticeComposer } from '../screens/PracticeComposer'

beforeEach(() => { if (typeof localStorage !== 'undefined') localStorage.clear() })

describe('Guide and practice training flow', () => {
  it('serves four lessons, the supplied video and all four scenario chips', async () => {
    const api = createMockApi('guide-catalog', 0)
    const training = await api.getTraining()
    expect(training.video.url).toBe('https://www.youtube.com/watch?v=LVcnXNLAPKo')
    expect(training.video.durationSec).toBe(658)
    expect(training.lessons).toHaveLength(4)
    expect(training.askChips).toHaveLength(4)
    expect(training.doneCount).toBe(2)
    expect(training.lessonCount).toBe(4)
  })

  it('grades three checks for the selected lesson and keeps its actual score', async () => {
    const api = createMockApi('guide-sequence', 0)
    let turn = await api.askPractice({ message: 'The wind changed', lessonId: 'withdraw', lang: 'en' })
    expect(turn.ruleKey).toBe('withdraw')
    expect(turn.check?.question.en).toContain('fire edge')
    expect(turn).not.toHaveProperty('correctId')
    expect(turn.check?.options).toHaveLength(3)
    expect(await api.answerPractice(turn.turnId, '1')).toMatchObject({ correct: false, lessonComplete: false })
    // A second click cannot change the score or the recorded answer.
    expect(await api.answerPractice(turn.turnId, '2')).toMatchObject({ correct: false })
    const previousId = turn.turnId
    turn = await api.askPractice({ message: 'The wind changed', lessonId: 'withdraw', lang: 'en', previousTurnId: previousId })
    expect(turn.check?.index).toBe(2)
    expect((await api.askPractice({ message: 'The wind changed', lessonId: 'withdraw', lang: 'en', previousTurnId: previousId })).turnId).toBe(turn.turnId)
    await api.answerPractice(turn.turnId, '2')
    expect((await api.getTraining()).lessons[2].status).toBe('in_progress')
    turn = await api.askPractice({ message: 'The wind changed', lessonId: 'withdraw', lang: 'en', previousTurnId: turn.turnId })
    expect(await api.answerPractice(turn.turnId, '2')).toMatchObject({ correct: true, lessonComplete: true })
    const training = await api.getTraining()
    expect(training.lessons[2]).toMatchObject({ id: 'withdraw', status: 'done', score: 2, total: 3 })
    expect(training.doneCount).toBe(3)
    expect(api.mock.observations).toHaveLength(0)
  })

  it('keeps peat and wind quizzes specific to their lessons', async () => {
    const api = createMockApi('guide-topics', 0)
    const peat = await api.askPractice({ message: 'old site', lessonId: 'peat_return', lang: 'id' })
    expect(peat.check?.lessonId).toBe('peat_return')
    expect(peat.reply.en).toContain('underground')
    const wind = await api.askPractice({ message: 'wind', lessonId: 'wind_upwind', lang: 'en' })
    expect(wind.ruleKey).toBe('upwind')
    expect(wind.check?.question.en).toContain('approach')
  })

  it('rejects skipping checks and keeps volunteers mock progress isolated', async () => {
    const api = createMockApi('guide-first', 0)
    const turn = await api.askPractice({ message: 'wind', lang: 'en' })
    await expect(api.askPractice({ message: 'wind', lang: 'en', previousTurnId: turn.turnId })).rejects.toThrow()
    await api.saveTrainingProgress({ videoProgressSec: 140 })
    const another = createMockApi('guide-second', 0)
    expect((await another.getTraining()).video.progressSec).toBe(80)
  })

  it('accepts YouTube watch, short and embed links and rejects unrelated hosts', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=LVcnXNLAPKo')).toBe('LVcnXNLAPKo')
    expect(youtubeId('https://youtu.be/LVcnXNLAPKo?t=10')).toBe('LVcnXNLAPKo')
    expect(youtubeId('https://www.youtube-nocookie.com/embed/LVcnXNLAPKo')).toBe('LVcnXNLAPKo')
    expect(youtubeId('https://example.com/watch?v=LVcnXNLAPKo')).toBeNull()
    expect(youtubeId('javascript:alert(1)')).toBeNull()
  })

  it('renders a native video player for hosted media and disables offline composition', () => {
    const html = renderToStaticMarkup(createElement(TrainingVideo, { video: { id: 'intro', title: { en: 'Training', id: 'Pelatihan' }, durationSec: 180, progressSec: 40, url: '/training/intro.mp4' }, lang: 'en', volunteerId: 'test', online: false, save: async () => undefined }))
    expect(html).toContain('<video')
    expect(html).toContain('controls=')
    expect(html).toContain('0:40')
    const composer = renderToStaticMarkup(createElement(PracticeComposer, { lang: 'en', placeholder: 'Ask', disabled: true, onSend: () => undefined }))
    expect(composer).toContain('disabled=')
    expect(composer).toContain('Dictate a question')
    expect(practiceSafety.withdraw.en).toContain('You never need permission to leave.')
  })
})

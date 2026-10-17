import { describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'

import { closedThankYouTask, currentTask } from '../digest'
import { createMockApi } from '../api/mock'
import { HoldToTalkPanel } from '../gateway/HoldToTalkPanel'
import { CoachReply } from '../gateway/CoachReply'
import { coachReceiptOf, coachTextOf } from '../gateway/transcript'
import { PhoneLayout } from '../layout/PhoneLayout'
import { LeadClosedScreen } from '../screens/LeadClosedScreen'
import { markSeenClosed, loadSeenClosed } from '../screens/seenClosed'
import {
  digest,
  fakeBrowser,
  incident,
  outboxHandle,
  renderVolunteer,
  task,
  volunteerValue,
} from './volunteerKit'

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ signOut: async () => undefined, user: null, me: null }) }))

fakeBrowser()

const layout = (path: string, over = {}) =>
  renderVolunteer(
    <Routes>
      <Route path="/pwa/*" element={<PhoneLayout />} />
    </Routes>,
    { path, value: volunteerValue(over) },
  )

describe('hold to talk + coach (#129, #130)', () => {
  it('shows unavailable hint without inventing a transcript', () => {
    const html = renderVolunteer(
      <HoldToTalkPanel
        lang="en"
        view={{
          button: 'unavailable',
          label: { id: 'Suara tidak tersedia', en: 'Voice unavailable' },
          status: { id: 'Tidak tersedia', en: 'Unavailable' },
          disabled: true,
        }}
        transcript={null}
        onPress={() => undefined}
        onRelease={() => undefined}
      />,
    )
    expect(html).toContain('data-testid="hold-to-talk"')
    expect(html).toContain('data-testid="hold-unavailable"')
    expect(html).toContain('Voice is not available in this browser')
    expect(html).not.toContain('data-testid="hold-transcript"')
  })

  it('shows coach reply only after a spoken report is saved', () => {
    const idle = renderVolunteer(
      <CoachReply lang="en" phase="idle" replyText={null} receivedAt={null} incidentLabel={null} />,
    )
    expect(idle).toBe('')
    const waiting = renderVolunteer(
      <CoachReply lang="en" phase="replying" replyText={null} receivedAt={null} incidentLabel={null} />,
    )
    expect(waiting).toContain('data-testid="coach-reply"')
    expect(waiting).toContain('Waiting for the reply')
    expect(waiting).not.toContain('data-testid="coach-receipt"')
  })

  it('reads coach receipt fields from the gateway payload only', () => {
    const msg = {
      type: 'reply',
      text: 'Stay upwind.',
      receivedAt: '2026-10-16T08:12:04Z',
      incidentLabel: 'TOHOR-3 · Desa Tohor · #1',
    }
    expect(coachTextOf(msg)).toBe('Stay upwind.')
    expect(coachReceiptOf(msg)).toEqual({
      receivedAt: '2026-10-16T08:12:04Z',
      incidentLabel: 'TOHOR-3 · Desa Tohor · #1',
    })
    expect(coachReceiptOf({ type: 'reply', text: 'Stay upwind.' })).toEqual({
      receivedAt: null,
      incidentLabel: null,
    })
  })
})

describe('lead closed (#140)', () => {
  it('prefers the thank-you over an open task card', () => {
    const closed = task({
      id: 'task_closed',
      closedAt: '2026-10-16T09:00:00Z',
      closedByName: 'Bu Maya',
      closeMessage: 'False alarm cleared. Nobody else has to walk out there.',
    })
    const html = layout('/pwa', {
      digest: digest({
        incidents: [incident()],
        myTasks: [closed],
        seasonStats: { checksDone: 3, falseAlarmsCleared: 1 },
      }),
    })
    expect(html).toContain('data-testid="lead-closed"')
    expect(html).toContain('Bu Maya')
    expect(html).toContain('False alarm cleared')
    expect(html).toContain('<strong>3</strong>')
    expect(html).not.toContain('/pwa/task/task_closed')
  })

  it('skips closed tasks in currentTask and dismisses via local storage', () => {
    const closed = task({
      id: 'task_closed', closedAt: '2026-10-16T09:00:00Z',
      closedByName: 'Bu Maya', closeMessage: 'Thanks for checking the canal edge.',
    })
    const open = task({ id: 'task_open' })
    const d = digest({ myTasks: [closed, open] })
    expect(currentTask(d)?.id).toBe('task_open')
    expect(closedThankYouTask(d, new Set())?.id).toBe('task_closed')
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
    }
    markSeenClosed('task_closed', storage)
    expect(loadSeenClosed(storage).has('task_closed')).toBe(true)
    expect(closedThankYouTask(d, loadSeenClosed(storage))).toBeNull()
  })

  it.each([undefined, '', '   '])('requires a personalized message for a thank-you (%s)', (closeMessage) => {
    const closed = task({ id: 'task_closed', closedAt: '2026-10-16T09:00:00Z', closeMessage })
    expect(closedThankYouTask(digest({ myTasks: [closed] }), new Set())).toBeNull()
  })

  it('renders season stats only when the API sent them', () => {
    const html = renderVolunteer(
      <LeadClosedScreen
        lang="en"
        task={task({ closedAt: '2026-10-16T09:00:00Z', closedByName: 'Bu Maya' })}
        seasonStats={null}
        onDismiss={() => undefined}
      />,
    )
    expect(html).toContain('data-testid="lead-closed"')
    expect(html).not.toContain('checks this season')
  })
})

describe('guide + practice (#153, #154)', () => {
  it('routes Guide and Practice under the phone layout', () => {
    expect(layout('/pwa/guide')).toMatch(/loading|guide-screen/i)
    const practice = layout('/pwa/guide/practice')
    expect(practice).toContain('data-testid="practice-screen"')
    expect(practice).toContain('PRACTICE · NOT A REAL FIRE')
    expect(practice).toContain('/pwa/guide')
  })

  it('mock training never creates an observation', async () => {
    const api = createMockApi('uid_dedi', 0)
    const before = api.mock.observations.length
    const reply = await api.askPractice({ message: 'What if the wind changes?', lang: 'en' })
    expect(reply.practice).toBe(true)
    expect(api.mock.observations.length).toBe(before)
    const training = await api.getTraining()
    expect(training.lessons.length).toBe(4)
    api.mock.closeLead()
    const d = await api.getDigest()
    expect(d.myTasks.some((row) => row.closedAt)).toBe(true)
    expect(d.seasonStats?.falseAlarmsCleared).toBeGreaterThan(0)
  })
})

describe('report voice path', () => {
  it('keeps hold-to-talk on the report tab', () => {
    const html = layout('/pwa/report', { outbox: outboxHandle() })
    expect(html).toContain('data-testid="hold-to-talk"')
  })
})

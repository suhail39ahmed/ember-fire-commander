import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { DECLINE_REASONS } from '../contracts/types'
import { ARRIVAL_RADIUS_M, arrivalOf, isSpotTask } from '../screens/arrival'
import { DeclineView } from '../screens/DeclineScreen'
import { canSendNotAFire, NOT_A_FIRE_REASONS, notAFireNote, UNSURE_CHIP } from '../screens/notAFire'
import { NotAFireView, type Shot } from '../screens/NotAFireScreen'
import { OnTheFireView, TaskDetailView, TaskScreen } from '../screens/TaskScreen'
import { digest, fakeBrowser, incident, renderVolunteer, task, talkView, volunteerValue } from './volunteerKit'

fakeBrowser()

const spot = { lat: 1.5, lng: 102.1 }
const near = { kind: 'ok' as const, lat: 1.5003, lng: 102.1, accuracyM: 9 } // about 33 m away
const far = { kind: 'ok' as const, lat: 1.4964, lng: 102.1, accuracyM: 9 } // about 400 m south of the spot
const talk = { view: talkView, onPress: () => undefined, onRelease: () => undefined }
const noop = () => undefined

const detail = (position: Parameters<typeof TaskDetailView>[0]['position'], lang: 'id' | 'en' = 'en', over = {}) =>
  renderVolunteer(<TaskDetailView lang={lang} task={task({ sentAt: '2026-10-16T06:58:00Z', ...over })} incident={incident(spot)} position={position} onBack={noop} />, { lang })

describe('arrival', () => {
  it('is inside the radius at about 30 m and outside at about 400 m', () => {
    expect(arrivalOf(near, spot).kind).toBe('there')
    const away = arrivalOf(far, spot)
    expect(away.kind).toBe('far')
    if (away.kind === 'far') {
      expect(away.distanceM).toBeGreaterThan(350)
      expect(away.compass).toBe('N')
    }
  })

  it('waits, or explains, until the phone has a fix', () => {
    expect(arrivalOf({ kind: 'waiting' }, spot).kind).toBe('waiting')
    expect(arrivalOf({ kind: 'denied' }, spot).kind).toBe('denied')
    expect(arrivalOf({ kind: 'unavailable' }, spot).kind).toBe('unavailable')
  })

  it('has no distance when the incident has no position', () => {
    expect(arrivalOf(near, null).kind).toBe('unavailable')
  })

  it('treats verify and investigate as spots to reach, and an instruction as an order', () => {
    expect(isSpotTask('verify')).toBe(true)
    expect(isSpotTask('investigate')).toBe(true)
    expect(isSpotTask('instruct')).toBe(false)
  })

  it('uses one named arrival radius', () => {
    expect(ARRIVAL_RADIUS_M).toBeGreaterThan(0)
  })
})

describe('task detail (#138)', () => {
  it('shows the API instruction, the distance and the direction, and turns the report button on at the spot', () => {
    const html = detail(near)
    expect(html).toContain('Cek tepi kanal')
    expect(html).toContain('data-testid="task-stats"')
    expect(html).toMatch(/<a[^>]*data-testid="im-there"/)
    expect(html).not.toMatch(/<button[^>]*data-testid="im-there"/)
  })

  it('keeps the report button off, and says how close to get, when the phone is far away', () => {
    const html = detail(far)
    expect(html).toMatch(/<button[^>]*disabled[^>]*data-testid="im-there"/)
    expect(html).toContain(`within ${ARRIVAL_RADIUS_M} m of the spot`)
    expect(html).toMatch(/<strong>\d{3}<\/strong><span>m to go/)
    expect(html).toContain('>N<')
  })

  it('keeps the button off while waiting for GPS, with no distance made up', () => {
    const html = detail({ kind: 'waiting' })
    expect(html).toMatch(/<button[^>]*disabled/)
    expect(html).toContain('Waiting for your phone location')
    expect(html).not.toContain('task-stats')
  })

  it('explains a blocked location and points to the Report tab when there is no fix', () => {
    expect(detail({ kind: 'denied' })).toContain('Location is blocked')
    expect(detail({ kind: 'unavailable' })).toContain('The Report tab still works')
  })

  it('opens the report with this task and incident attached when the volunteer is there', () => {
    expect(detail(near)).toContain('href="/pwa/report"')
  })

  it('has no wind card and no other-volunteer name', () => {
    const html = detail(near)
    expect(html).not.toMatch(/wind|angin|km\/h/i)
    expect(html).not.toMatch(/Rizal|Sari/)
  })

  it('shows the sent time, Not a fire and Can\'t do it', () => {
    const html = detail(near)
    expect(html).toMatch(/Verify · SENT \d\d:\d\d|Verifikasi|Check/)
    expect(html).toContain('/pwa/task/task_1/not-a-fire')
    expect(html).toContain('/pwa/task/task_1/decline')
  })

  it('uses the Indonesian compass letters in Bahasa', () => {
    const html = detail(far, 'id')
    expect(html).toContain('>U<')
    expect(html).toContain('m lagi')
  })
})

const fire = (over: Partial<Parameters<typeof OnTheFireView>[0]> = {}, lang: 'id' | 'en' = 'en') =>
  renderVolunteer(
    <OnTheFireView lang={lang} task={task({ type: 'instruct', instruction: 'Wet the ground along the west ditch.' })} incident={incident()} talk={talk} action={{ kind: 'idle' }} onDoingIt={noop} onBack={noop} {...over} />,
    { lang },
  )

describe('on the fire (#136)', () => {
  it('shows the supervisor instruction as the order, with Doing it and Can\'t do it', () => {
    const html = fire()
    expect(html).toContain('Wet the ground along the west ditch.')
    expect(html).toContain('data-testid="doing-it"')
    expect(html).toContain('href="/pwa/task/task_1/decline"')
    expect(html).toContain('Hold to talk')
  })

  it('shows no coach card and no wind, because neither is on the API', () => {
    const html = fire()
    expect(html).not.toMatch(/coach|suggestion|wind/i)
  })

  it('keeps the answer after a reload: acceptedAt turns the buttons into a note', () => {
    const html = fire({ task: task({ type: 'instruct', acceptedAt: '2026-10-16T07:00:00Z' }) })
    expect(html).toContain('data-testid="accepted-note"')
    expect(html).not.toContain('data-testid="doing-it"')
  })

  it('shows a decline as noted and removes the buttons', () => {
    const html = fire({ task: task({ type: 'instruct', declinedAt: '2026-10-16T07:00:00Z', declineReason: 'unsafe' }) })
    expect(html).toContain('data-testid="declined-note"')
    expect(html).not.toContain('data-testid="doing-it"')
  })

  it('says it could not send, in the volunteer language, without a status code', () => {
    const html = fire({ action: { kind: 'failed' } }, 'id')
    expect(html).toContain('Tidak terkirim')
    expect(html).not.toMatch(/\b(4|5)\d\d\b/)
  })

  it('disables Doing it while the call is in flight', () => {
    expect(fire({ action: { kind: 'busy' } })).toMatch(/<button[^>]*disabled[^>]*data-testid="doing-it"/)
  })
})

const decline = (over: Partial<Parameters<typeof DeclineView>[0]> = {}, lang: 'id' | 'en' = 'en') =>
  renderVolunteer(
    <DeclineView lang={lang} instruction="Wet the ground" reason={null} note="" action={{ kind: 'idle' }} alreadyDeclined={false} onReason={noop} onNote={noop} onSend={noop} onBack={noop} {...over} />,
    { lang },
  )

describe("can't do it (#137)", () => {
  it('lists every reason from the contract with a label in both languages', () => {
    const en = decline()
    const id = decline({}, 'id')
    for (const reason of DECLINE_REASONS) {
      expect(en).toContain(`value="${reason}"`)
      expect(id).toContain(`value="${reason}"`)
    }
    expect(en).toContain('Not safe here')
    expect(id).toContain('Tidak aman di sini')
  })

  it('shows the instruction being declined and keeps Send off until a reason is picked', () => {
    expect(decline()).toContain('Wet the ground')
    expect(decline()).toMatch(/<button[^>]*disabled[^>]*data-testid="decline-send"/)
    expect(decline({ reason: 'unsafe' })).not.toMatch(/<button[^>]*disabled[^>]*data-testid="decline-send"/)
  })

  it('has an optional note capped at 300 characters', () => {
    expect(decline()).toContain('maxLength="300"')
  })

  it('hurt opens a need-help report and is not a decline', () => {
    const html = decline()
    expect(html).toMatch(/<a[^>]*data-testid="decline-hurt"[^>]*href="\/pwa\/report"/)
  })

  it('shows an earlier decline as done instead of the form', () => {
    const html = decline({ alreadyDeclined: true })
    expect(html).toContain('data-testid="decline-done"')
    expect(html).not.toContain('decline-send')
  })
})

describe('not a fire (#139)', () => {
  const shot: Shot = { blob: new Blob([]), contentType: 'image/jpeg', previewUrl: 'blob:x', capturedAt: '2026-10-16T08:00:00Z', pos: { lat: 1.5, lng: 102.1, accuracyM: 12 } }
  const view = (over: Partial<Parameters<typeof NotAFireView>[0]> = {}, lang: 'id' | 'en' = 'en') =>
    renderVolunteer(
      <NotAFireView lang={lang} instruction="Check the canal" distanceText="380 m" reason={null} shot={null} state={{ kind: 'idle' }} onReason={noop} onPickPhoto={noop} onSend={noop} onUnsure={noop} onBack={noop} {...over} />,
      { lang },
    )

  it('keeps Send off until both a reason and a photo are present', () => {
    expect(canSendNotAFire(null, false)).toBe(false)
    expect(canSendNotAFire('fog_dust', false)).toBe(false)
    expect(canSendNotAFire(null, true)).toBe(false)
    expect(canSendNotAFire('fog_dust', true)).toBe(true)
    expect(view({ reason: 'fog_dust' })).toMatch(/<button[^>]*disabled[^>]*data-testid="notfire-send"/)
    expect(view({ shot })).toMatch(/<button[^>]*disabled[^>]*data-testid="notfire-send"/)
    expect(view({ reason: 'fog_dust', shot })).not.toMatch(/<button[^>]*disabled[^>]*data-testid="notfire-send"/)
  })

  it('says what is missing, shows the distance and the photo accuracy', () => {
    expect(view()).toContain('data-testid="notfire-hint"')
    expect(view()).toContain('380 m')
    expect(view({ reason: 'fog_dust', shot })).toContain('±12 m')
  })

  it('lists the reasons with labels in both languages', () => {
    for (const reason of NOT_A_FIRE_REASONS) expect(view()).toContain(`value="${reason}"`)
    expect(view({}, 'id')).toContain('Kabut atau debu')
  })

  it('stores the reason as Bahasa words on the photo note, whatever the phone language', () => {
    expect(notAFireNote('fog_dust')).toBe('Bukan kebakaran: Kabut atau debu')
    expect(notAFireNote('other').length).toBeLessThanOrEqual(280)
  })

  it('Not sure is a smoke report, not a not-a-fire', () => {
    expect(UNSURE_CHIP).toBe('asap')
    expect(view()).toContain('data-testid="notfire-unsure"')
  })

  it('shows the result, and says when it is kept on the phone', () => {
    expect(view({ state: { kind: 'done', queued: false } })).toContain('Your supervisor has your answer.')
    expect(view({ state: { kind: 'done', queued: true } })).toContain('Kept on this phone')
  })
})

describe('task route', () => {
  const route = (path: string, over = {}) =>
    renderVolunteer(<Routes><Route path="/pwa/task/:id" element={<TaskScreen />} /></Routes>, { path, value: volunteerValue(over) })

  it('says plainly when the task is not in the list', () => {
    const html = route('/pwa/task/nope', { digest: digest() })
    expect(html).toContain('data-testid="task-not-found"')
  })

  it('does not open a task that is still proposed', () => {
    expect(route('/pwa/task/task_1', { digest: digest({ myTasks: [task({ status: 'proposed' })] }) })).toContain('task-not-found')
  })

  it('opens a verify task as task detail and an instruction as On the fire', () => {
    const d = digest({ incidents: [incident()], myTasks: [task(), task({ id: 'task_2', type: 'instruct' })] })
    expect(route('/pwa/task/task_1', { digest: d })).toContain('data-testid="im-there"')
    expect(route('/pwa/task/task_2', { digest: d })).toContain('data-testid="doing-it"')
  })
})

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ signOut: async () => undefined, user: null, me: null }) }))

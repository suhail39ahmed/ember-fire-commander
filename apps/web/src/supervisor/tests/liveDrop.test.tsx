import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { formatTime } from '../../pwa/formatTime'
import type { LiveSeat } from '../contracts'
import { LiveDropBanner } from '../detail/LiveDropBanner'
import { VolunteerCard } from '../detail/VolunteerCard'
import type { VolunteerRow } from '../detail/model'

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'ready',
    user: null,
    me: { id: 'sup_1', displayName: 'Bu Maya', role: 'supervisor' as const },
    message: null,
    signIn: async () => undefined,
    signOut: async () => undefined,
    refreshMe: async () => undefined,
  }),
}))

const dropAt = '2026-10-16T14:31:00.000Z'

function seat(over: Partial<LiveSeat> = {}): LiveSeat {
  return {
    incidentId: 'inc_tohor',
    status: 'free',
    holderId: null,
    holderName: null,
    lastDrop: {
      volunteerId: 'uid_sari',
      volunteerName: 'Sari',
      at: dropAt,
      reason: 'signal_below_3g',
      signal: '2g',
    },
    volunteers: {
      uid_sari: {
        signal: '2g',
        media: 'photo_60s',
        photoCadence: 'every_60s',
        canRetry: false,
        canMakeLive: false,
      },
      uid_rizal: {
        signal: '4g',
        media: 'none',
        photoCadence: null,
        canRetry: false,
        canMakeLive: true,
      },
    },
    ...over,
  }
}

function row(over: Partial<VolunteerRow> = {}): VolunteerRow {
  return {
    id: 'uid_sari',
    name: 'Sari',
    reportCount: 1,
    latest: null,
    task: null,
    withdrawn: false,
    ...over,
  }
}

describe('live video dropped', () => {
  it('shows who dropped, when, signal, and that the seat is free', () => {
    const markup = renderToStaticMarkup(<LiveDropBanner lang="en" seat={seat()} />)
    expect(markup).toContain('Sari')
    expect(markup).toContain(formatTime(dropAt))
    expect(markup).toContain('2G')
    expect(markup).toContain('Live seat is free')
    expect(markup).toContain('photo every 60 s')
    expect(markup).not.toContain('TOHOR')
  })

  it('hides the banner when there is no drop', () => {
    expect(renderToStaticMarkup(<LiveDropBanner lang="en" seat={seat({ lastDrop: null })} />)).toBe('')
    expect(renderToStaticMarkup(<LiveDropBanner lang="en" seat={undefined} />)).toBe('')
  })

  it('disables retry until the API says the signal is good enough', () => {
    const markup = renderToStaticMarkup(
      <VolunteerCard lang="en" row={row()} live={seat().volunteers.uid_sari} onRetryLive={async () => undefined} />,
    )
    expect(markup).toContain('PHOTO · EVERY 60 S')
    expect(markup).toContain('Retry live — needs 3G or better')
    expect(markup).toContain('disabled')
  })

  it('offers make-live when the seat is free and signal is good', () => {
    const markup = renderToStaticMarkup(
      <VolunteerCard
        lang="en"
        row={row({ id: 'uid_rizal', name: 'Rizal' })}
        live={seat().volunteers.uid_rizal}
        onMakeLive={async () => undefined}
      />,
    )
    expect(markup).toContain('Make Rizal live — seat is free')
    expect(markup).not.toContain('disabled')
  })
})

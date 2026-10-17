import { describe, expect, it, vi } from 'vitest'

import { HomeScreen } from '../screens/HomeScreen'
import { DirectJoinedView } from '../screens/JoinedScreen'
import { NearbyPrompt } from '../screens/NearbyPrompt'
import { dismissNearby, isNearbyDismissed } from '../screens/nearbyDismiss'
import type { NearbyIncident } from '../contracts/types'
import { digest, fakeApi, fakeBrowser, incident, renderVolunteer } from './volunteerKit'

fakeBrowser()

const nearby: NearbyIncident = {
  ...incident({ id: 'inc_near', name: 'TOHOR-3 · Peat field · #3', area: 'Peat field' }),
  distanceM: 1400,
  bearingDeg: 45,
  crewOnSite: 4,
  reporterName: null,
}

describe('nearby dismiss (#134)', () => {
  it('remembers Not now for an incident on this phone', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
    })
    expect(isNearbyDismissed('vol_a', 'inc_x')).toBe(false)
    dismissNearby('vol_a', 'inc_x')
    expect(isNearbyDismissed('vol_a', 'inc_x')).toBe(true)
    expect(isNearbyDismissed('vol_b', 'inc_x')).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('NearbyPrompt (#134)', () => {
  it('shows distance, severity, crew and Join now', () => {
    const html = renderVolunteer(
      <NearbyPrompt
        lang="en"
        api={fakeApi({ joinIncident: async () => ({
          incidentId: 'inc_near', volunteerId: 'vol_1', joinedAt: '2026-10-16T08:00:00Z', addedBy: 'vol_1',
          addedByName: 'Pak Dedi', teamRole: null, enRouteAt: null, destination: null, approach: null,
          meetPoint: null, meetPerson: null, meetNote: null,
        }) })}
        volunteerId="vol_1"
        nearby={nearby}
        you={{ lat: 1.48, lng: 102.11 }}
        onDismissed={() => undefined}
        onJoined={() => undefined}
      />,
    )
    expect(html).toContain('nearby-prompt')
    expect(html).toContain('FIRE REPORTED')
    expect(html).toContain('1.4')
    expect(html).toContain('Small flame')
    expect(html).toContain('4 crew on site')
    expect(html).toContain('Join now')
    expect(html).toContain('Not now')
    expect(html).not.toContain('WIND')
  })
})

describe('HomeScreen nearby (#134)', () => {
  it('shows the prompt when digest.nearby has a fire that was not dismissed', () => {
    const html = renderVolunteer(
      <HomeScreen
        lang="en"
        digest={digest({ nearby: [nearby] })}
        status="ready"
        lastSyncAt="2026-10-16T08:00:00Z"
        online
        queuedCount={0}
        api={fakeApi()}
        volunteerId="vol_1"
        onRefresh={() => undefined}
      />,
    )
    expect(html).toContain('nearby-prompt')
    expect(html).toContain('TOHOR-3')
  })
})

describe('JoinedView (#135)', () => {
  it('shows the first instruction, omits missing meet/route, and keeps en-route label', () => {
    const html = renderVolunteer(
      <DirectJoinedView
        lang="en"
        detail={{
          incident: { ...incident({ id: 'inc_near' }), evidenceScore: null, conflictId: null },
          observations: [],
          conflict: null,
          tasks: [{ id: 't1', incidentId: 'inc_near', volunteerId: 'vol_1', type: 'instruct', status: 'approved', instruction: 'Pump at the west ditch' }],
          membership: {
            incidentId: 'inc_near',
            volunteerId: 'vol_1',
            joinedAt: '2026-10-16T08:26:00Z',
            addedBy: 'vol_1',
            addedByName: 'Pak Dedi',
            teamRole: null,
            enRouteAt: '2026-10-16T08:30:00Z',
            destination: null,
            approach: null,
            meetPoint: null,
            meetPerson: null,
            meetNote: null,
          },
        }}
        liveDistanceLabel="1.4 KM"
        enRouteAt="2026-10-16T08:30:00Z"
        busy={false}
        error={null}
        onMyWay={() => undefined}
      />,
    )
    expect(html).toContain('joined-screen')
    expect(html).toContain('YOU JOINED')
    expect(html).toContain('Pak Dedi')
    expect(html).toContain('First task: Pump at the west ditch')
    expect(html).toContain('Go 1.4 KM')
    expect(html).not.toContain('Meet ')
    expect(html).toContain('On the way')
    expect(html).toContain('joined-en-route-at')
  })
})

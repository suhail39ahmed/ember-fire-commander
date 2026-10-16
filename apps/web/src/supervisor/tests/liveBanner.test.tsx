import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { formatTimeZone } from '../../pwa/formatTime'
import { LiveBanner } from '../LiveBanner'
import { UpdatedLine } from '../UpdatedLine'
import type { LiveFire } from '../chromeClient'
import { fixture } from '../fixtures'

const updatedAt = '2026-10-16T07:46:00Z'

function fire(over: Partial<LiveFire> = {}): LiveFire {
  return {
    id: 'inc_a',
    peopleOnSite: 2,
    withdrawActive: false,
    code: null,
    placeName: null,
    liveCameras: null,
    photoCadence: null,
    distanceToRisk: null,
    since: null,
    ...over,
  }
}

function html(props: Partial<ComponentProps<typeof LiveBanner>> = {}) {
  return renderToStaticMarkup(
    <StaticRouter location="/console">
      <LiveBanner
        fires={[fire(), fire({ id: 'inc_b', peopleOnSite: 1, withdrawActive: true })]}
        updatedAt={updatedAt}
        nextSatellitePass={null}
        loading={false}
        retrying={false}
        lang="en"
        {...props}
      />
    </StaticRouter>,
  )
}

describe('live banner', () => {
  it('shows the count, the clock, people on site, and an active withdraw', () => {
    const markup = html()
    expect(markup).toContain('LIVE · 2 FIRES NEED YOU')
    expect(markup).toContain(`Updated ${formatTimeZone(updatedAt)} · next satellite pass —`)
    expect(markup).toContain('2 on site · — · —')
    expect(markup).toContain('1 on site · — · —')
    expect(markup).toContain('Withdraw')
    expect(markup).toContain('href="/console/incidents/inc_a"')
    expect(markup).toContain('href="/console/incidents/inc_b"')
    expect(markup).not.toContain('TOHOR')
    expect(markup).not.toContain('180')
  })

  it('shows the code, the place, and the time the first report came in', () => {
    const since = '2026-10-16T07:10:30.000Z'
    const markup = html({
      fires: [fire({ code: '#3', placeName: 'Bengkalis, Riau', since })],
    })
    expect(markup).toContain('#3 · Incident · Bengkalis, Riau')
    expect(markup).toContain(`2 on site · — · since ${formatTimeZone(since)}`)
    expect(markup).not.toContain(since)
  })

  it('names a fire like the queue does, and never prints its id', () => {
    const incident = { ...fixture('normal').incident, id: 'inc_a', name: 'Dumai, Riau · Pak Dedi · #2' }
    const markup = html({ fires: [fire({ placeName: 'Dumai' })], queue: [incident] })
    expect(markup).toContain('Dumai, Riau · Pak Dedi · #2')
    expect(markup).not.toMatch(/>Incident inc_a|inc_a<\/p>/)
  })

  it('falls back to the place, then to a plain word, for a fire the queue does not have', () => {
    expect(html({ fires: [fire({ placeName: 'Dumai' })], queue: [] })).toContain('>Incident · Dumai<')
    const bare = html({ fires: [fire()], queue: null })
    expect(bare).toContain('>Incident<')
  })

  it('prefers the distance to risk over the first-report time when both exist', () => {
    const markup = html({ fires: [fire({ distanceToRisk: '3 km', since: '2026-10-16T07:10:30.000Z' })] })
    expect(markup).toContain('2 on site · — · 3 km')
  })

  it('uses the singular heading for one fire', () => {
    expect(html({ fires: [fire()] })).toContain('1 FIRE NEEDS YOU')
  })

  it('hides the banner when no fire is live', () => {
    expect(html({ fires: [] })).toBe('')
  })

  it('shows a loading line without a count before the first read', () => {
    const markup = html({ fires: null, loading: true })
    expect(markup).toContain('Loading live fires…')
    expect(markup).not.toContain('FIRES NEED YOU')
  })

  it('keeps the last fires and says it is retrying', () => {
    const markup = html({ retrying: true })
    expect(markup).toContain('2 FIRES NEED YOU')
    expect(markup).toContain('Showing the last live fires. Retrying.')
  })

  it('does not invent fires when the first read fails', () => {
    const markup = html({ fires: null, loading: false, retrying: true })
    expect(markup).toContain('Could not load live fires. Retrying.')
    expect(markup).not.toContain('FIRES NEED YOU')
  })
})

describe('updated line', () => {
  it('says when the dashboard was last read and how often it checks, in the viewer’s time zone', () => {
    const markup = renderToStaticMarkup(<UpdatedLine updatedAt={updatedAt} lang="en" />).replace(/<!-- -->/g, '')
    expect(markup).toContain(`Updated <time dateTime="${updatedAt}">${formatTimeZone(updatedAt)}</time> · checks every 15 s`)
    expect(renderToStaticMarkup(<UpdatedLine updatedAt={updatedAt} lang="id" />)).toContain('memeriksa tiap 15 detik')
  })

  it('shows nothing when there has been no read yet', () => {
    expect(renderToStaticMarkup(<UpdatedLine updatedAt={null} lang="en" />)).toBe('')
  })
})

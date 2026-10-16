import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Incident } from '../contracts'
import { fixture } from '../fixtures'
import { IncidentQueue } from '../IncidentQueue'
import {
  areaOf, flattenGroups, groupByArea, incidentNumber, labelInArea, UNNAMED_AREA,
} from '../queueGroups'

const base = fixture('normal').incident
const inc = (id: string, over: Partial<Incident> = {}): Incident => ({ ...base, id, name: null, area: null, ...over })
const noPosition = { lat: Number.NaN, lng: Number.NaN }
const named = (id: string, area: string, n: number, over: Partial<Incident> = {}) =>
  inc(id, { area, name: `${area} · Pak Dedi · #${n}`, ...over })

describe('areaOf', () => {
  it('uses the stored area', () => {
    expect(areaOf(named('a', 'Bengkalis, Riau', 3))).toBe('Bengkalis, Riau')
  })

  it('takes the part of the name before the first separator when there is no area', () => {
    expect(areaOf(inc('a', { name: 'Dumai, Riau · Sari · #2' }))).toBe('Dumai, Riau')
  })

  it('uses the position as the area when there is neither a stored area nor a name', () => {
    expect(areaOf(inc('a'))).toBe('1.85°S 110.05°E')
    expect(areaOf(inc('a', { area: '  ', name: '', lat: 13.05, lng: 77.63 }))).toBe('13.05°N 77.63°E')
  })

  it('puts incidents with no area, no name and no position under "Unnamed area"', () => {
    expect(areaOf(inc('a', { lat: Number.NaN, lng: Number.NaN }))).toBe(UNNAMED_AREA)
    expect(UNNAMED_AREA).toBe('Unnamed area')
  })
})

describe('incidentNumber', () => {
  it('reads the number at the end of the name', () => {
    expect(incidentNumber(named('a', 'Dumai, Riau', 12))).toBe(12)
    expect(incidentNumber(inc('a'))).toBe(-1)
    expect(incidentNumber(inc('a', { name: 'no number here' }))).toBe(-1)
  })
})

describe('groupByArea', () => {
  it('groups by area and keeps the incoming order inside a group', () => {
    const groups = groupByArea([named('a', 'Dumai, Riau', 1), named('b', 'Bengkalis, Riau', 2), named('c', 'Dumai, Riau', 3)])
    // Same severity: Dumai holds the newest incident (#3), so it is listed first.
    expect(groups.map((g) => [g.area, g.incidents.map((i) => i.id)])).toEqual([
      ['Dumai, Riau', ['a', 'c']],
      ['Bengkalis, Riau', ['b']],
    ])
  })

  it('orders groups by highest severity first', () => {
    const groups = groupByArea([
      named('a', 'Dumai, Riau', 9, { severity: 'smoke' }),
      named('b', 'Bengkalis, Riau', 1, { severity: 'large_flame' }),
      named('c', 'Ketapang, Kalimantan Barat', 5, { severity: 'small_flame' }),
    ])
    expect(groups.map((g) => g.area)).toEqual(['Bengkalis, Riau', 'Ketapang, Kalimantan Barat', 'Dumai, Riau'])
  })

  it('breaks a severity tie with the newest incident', () => {
    const groups = groupByArea([
      named('a', 'Dumai, Riau', 2),
      named('b', 'Bengkalis, Riau', 7),
      named('c', 'Dumai, Riau', 4),
    ])
    expect(groups.map((g) => g.area)).toEqual(['Bengkalis, Riau', 'Dumai, Riau'])
  })

  it('puts an active withdraw group first, whatever the severity', () => {
    const withdraw = { active: true as const, instruction: 'Withdraw upwind.', reasons: ['wind'], volunteerIds: ['uid_dedi'] }
    const groups = groupByArea([
      named('a', 'Bengkalis, Riau', 9, { severity: 'large_flame' }),
      named('b', 'Dumai, Riau', 1, { severity: 'smoke', withdraw }),
    ])
    expect(groups.map((g) => g.area)).toEqual(['Dumai, Riau', 'Bengkalis, Riau'])
  })

  it('shows unnamed incidents in one group, after named ones of the same severity', () => {
    const groups = groupByArea([inc('x', noPosition), named('a', 'Dumai, Riau', 1), inc('y', noPosition)])
    expect(groups.map((g) => [g.area, g.incidents.length])).toEqual([['Dumai, Riau', 1], [UNNAMED_AREA, 2]])
  })

  it('is stable: grouping the flattened result again changes nothing', () => {
    const once = groupByArea([
      named('a', 'Dumai, Riau', 2, { severity: 'smoke' }),
      named('b', 'Bengkalis, Riau', 7),
      inc('c'),
      named('d', 'Dumai, Riau', 3, { severity: 'smoke' }),
    ])
    expect(groupByArea(flattenGroups(once))).toEqual(once)
  })

  it('returns nothing for an empty queue', () => {
    expect(groupByArea([])).toEqual([])
    expect(flattenGroups([])).toEqual([])
  })
})

describe('labelInArea', () => {
  it('drops the area prefix under its heading', () => {
    expect(labelInArea(named('a', 'Bengkalis, Riau', 3), 'Bengkalis, Riau')).toBe('Pak Dedi · #3')
  })

  it('keeps the whole label when it does not start with the area', () => {
    expect(labelInArea(inc('4kQ9xZ7hLm', noPosition), UNNAMED_AREA)).toBe('Incident')
    expect(labelInArea(inc('4kQ9xZ7hLm'), '1.85°S 110.05°E')).toBe('Incident · 1.85°S 110.05°E')
    expect(labelInArea(named('a', 'Dumai, Riau', 1), 'Bengkalis, Riau')).toBe('Dumai, Riau · Pak Dedi · #1')
  })
})

describe('IncidentQueue', () => {
  const groups = groupByArea([
    named('a', 'Bengkalis, Riau', 3, { severity: 'large_flame' }),
    named('b', 'Bengkalis, Riau', 1),
    named('c', 'Dumai, Riau', 2),
    inc('4kQ9xZ7hLm', noPosition),
  ])
  const html = renderToStaticMarkup(<IncidentQueue groups={groups} activeId="c" onSelect={() => undefined} />)

  it('renders a heading with the count for each area', () => {
    expect(html).toContain('>Bengkalis, Riau (2)</h3>')
    expect(html).toContain('>Dumai, Riau (1)</h3>')
    expect(html).toContain('>Unnamed area (1)</h3>')
  })

  it('labels the queue and each group', () => {
    expect(html).toContain('aria-label="Incident queue"')
    expect(html.match(/<section [^>]*aria-labelledby="queue-area-\d"/g)).toHaveLength(3)
    expect(html.match(/<h3 id="queue-area-\d"/g)).toHaveLength(3)
  })

  it('lists incidents under their heading, in group order', () => {
    expect(html.indexOf('Bengkalis, Riau (2)')).toBeLessThan(html.indexOf('Dumai, Riau (1)'))
    expect(html.indexOf('Dumai, Riau (1)')).toBeLessThan(html.indexOf('Unnamed area (1)'))
    expect(html).toContain('<span>Pak Dedi · #3</span>')
    expect(html).toContain('<span>Incident</span>')
    expect(html).not.toMatch(/INC-|4kQ9/)
  })

  it('marks only the active incident', () => {
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
    expect(html).toContain('sup-queue-item active')
    expect(html).toContain('Pak Dedi · #2')
  })

  it('counts open, held, and verified, leaves Closed empty, and shows a dash for numbers the server did not send', () => {
    expect(html).toContain('Open 4')
    expect(html).toContain('Held 0')
    expect(html).toContain('Verified 0')
    expect(html).toContain('Closed —')
    expect(html).toContain('— reports · — volunteers · evidence 45')
    expect(html).not.toContain('>— · —<')
    expect(html).not.toContain('TOHOR')
  })
})

describe('IncidentQueue with the supervisor fields', () => {
  const render = (items: Incident[]) =>
    renderToStaticMarkup(<IncidentQueue groups={groupByArea(items)} activeId={null} onSelect={() => undefined} />)

  it('shows the real report and volunteer counts', () => {
    const html = render([named('a', 'Dumai, Riau', 1, { reportCount: 4, volunteerCount: 2 })])
    expect(html).toContain('4 reports · 2 volunteers · evidence 45')
    expect(html).not.toContain('— reports')
  })

  it('shows zero as zero, not as a dash', () => {
    const html = render([named('a', 'Dumai, Riau', 1, { reportCount: 0, volunteerCount: 0 })])
    expect(html).toContain('0 reports · 0 volunteers')
  })

  it('names who verified a verified incident, and a dash when no name was stored', () => {
    const withName = render([named('a', 'Dumai, Riau', 1, { status: 'verified', verified: true, verifiedBy: 'Bu Maya' })])
    expect(withName).toContain('Verified by Bu Maya')
    const noName = render([named('a', 'Dumai, Riau', 1, { status: 'verified', verified: true, verifiedBy: null })])
    expect(noName).toContain('Verified by —')
    const open = render([named('a', 'Dumai, Riau', 1, { verifiedBy: 'Bu Maya' })])
    expect(open).not.toContain('Verified by')
  })

  it('flags an incident with a Need help report, and only that one', () => {
    const html = render([
      named('a', 'Dumai, Riau', 1, { needsHelp: true }),
      named('b', 'Dumai, Riau', 2, { needsHelp: false }),
      named('c', 'Dumai, Riau', 3),
    ])
    expect(html.match(/incident-need-help/g)).toHaveLength(1)
    expect(html).toContain('>NEED HELP<')
  })

  it('speaks Bahasa on the badge', () => {
    const html = renderToStaticMarkup(
      <IncidentQueue groups={groupByArea([named('a', 'Dumai, Riau', 1, { needsHelp: true })])} activeId={null} onSelect={() => undefined} lang="id" />,
    )
    expect(html).toContain('>BUTUH BANTUAN<')
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createMockSupervisorApi } from '../../api/mock'
import { fixture } from '../../fixtures'
import { hasMapsKey } from '../config'
import { regionFixtures } from '../fixtures'
import { IncidentMap } from '../IncidentMap'
import { loadMaps } from '../loadMaps'
import { PIN_COLOR, pinStyle, placeable, project } from '../markers'

const region = () => regionFixtures().map((d) => d.incident)
const render = (props: Partial<Parameters<typeof IncidentMap>[0]> = {}) =>
  renderToStaticMarkup(
    <IncidentMap incidents={region()} selectedId="inc_demo_02" onSelect={() => undefined} mapsKey="" {...props} />,
  )

describe('pin rules', () => {
  it('labels pins with the incident name, or a short id for an unnamed one', () => {
    const [conflict, normal] = region()
    expect(pinStyle(normal).label).toBe('Ketapang, Kalimantan Barat · Sari · #2 · Open · Small flame')
    expect(pinStyle({ ...conflict, name: null, id: '4kQ9xZ7hLm' }).label).toMatch(/^INC-7HLM · /)
    expect(pinStyle({ ...conflict, name: undefined, id: '4kQ9xZ7hLm' }).label).not.toContain('4kQ9xZ7hLm')
  })

  it('colours by severity and marks conflict, withdraw and verified', () => {
    const [conflict, normal, withdraw] = region()
    expect(pinStyle(normal)).toMatchObject({ color: PIN_COLOR.small_flame, conflict: false, withdraw: false, badge: null })
    expect(pinStyle(conflict)).toMatchObject({ conflict: true, badge: 'Same fire?' })
    expect(pinStyle(withdraw)).toMatchObject({ color: PIN_COLOR.large_flame, withdraw: true, badge: 'Withdrawn' })
    expect(pinStyle({ ...normal, status: 'verified' }).verified).toBe(true)
  })

  it('keeps the withdraw mark when severity is lowered', () => {
    const withdraw = { ...region()[2], severity: 'none' as const }
    expect(pinStyle(withdraw).withdraw).toBe(true)
  })

  it('skips incidents without usable coordinates', () => {
    const [a] = region()
    expect(placeable([a, { ...a, id: 'bad', lat: Number.NaN }, { ...a, id: 'far', lng: 200 }]).map((i) => i.id)).toEqual([a.id])
  })

  it('projects distinct incidents to distinct points, north up', () => {
    const points = project(region(), 640, 300)
    const keys = new Set(points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`))
    expect(keys.size).toBe(3)
    const north = points.find((p) => p.id === 'inc_demo_02')!
    const south = points.find((p) => p.id === 'inc_demo_03')!
    expect(north.y).toBeLessThan(south.y)
  })

  it('treats a missing or placeholder key as no key', () => {
    expect(hasMapsKey('')).toBe(false)
    expect(hasMapsKey('your-maps-browser-key-here')).toBe(false)
    expect(hasMapsKey('AIza-test')).toBe(true)
  })
})

describe('IncidentMap', () => {
  it('shows two or more fixture incidents at distinct positions without a key', () => {
    const html = render()
    expect(html).toContain('Map tiles are off (no browser key).')
    const pins = html.match(/class="map-pin[^"]*"[^>]*style="left:([\d.]+)%;top:([\d.]+)%/g) ?? []
    expect(pins.length).toBe(3)
    expect(new Set(pins).size).toBe(3)
    expect(html).toContain('3 incidents · positions from ember-api')
  })

  it('marks the queue selection on the map', () => {
    const html = render()
    expect(html).toMatch(/class="map-pin selected"[^>]*aria-label="Ketapang, Kalimantan Barat · Sari · #2/)
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1)
  })

  it('shows withdraw and conflict markers', () => {
    const html = render()
    expect(html).toMatch(/class="map-pin conflict withdraw"/)
    expect(html).toContain('>Withdrawn<')
    expect(html).toContain('>Same fire?<')
    expect(html).toContain('Withdraw zone · indicative')
  })

  it('handles an empty incident list', () => {
    const html = render({ incidents: [] })
    expect(html).toContain('No incident positions to show.')
    expect(html).not.toContain('map-pin ')
  })

  it('labels guidance as indicative and shows no forecast or unapproved links', () => {
    const html = render()
    expect(html).toContain('Guidance is indicative. EMBER does not forecast fire spread or haze.')
    expect(html).not.toMatch(/illustrative data|exposure corridor|hotspot/i)
  })

  it('renders the map container when a key is set', () => {
    const html = render({ mapsKey: 'AIza-test' })
    expect(html).toContain('aria-label="Incident map"')
    expect(html).not.toContain('map-schematic')
  })

  it('does not load Maps outside a browser', async () => {
    await expect(loadMaps('AIza-test')).rejects.toThrow(/browser/)
  })
})

describe('region mock', () => {
  it('serves three incidents at distinct positions and still holds dispatch', async () => {
    const api = createMockSupervisorApi('uid_maya', 'region', 0)
    const list = await api.listIncidents()
    expect(list.map((i) => i.id)).toEqual(['inc_demo_01', 'inc_demo_02', 'inc_demo_03'])
    expect(new Set(list.map((i) => `${i.lat},${i.lng}`)).size).toBe(3)
    const detail = await api.getIncident('inc_demo_03')
    expect(detail.conflict?.incidentId).toBe('inc_demo_03')
    await expect(api.approveTask('task_demo_investigate_inc_demo_03')).rejects.toMatchObject({ code: 'conflict' })
    expect((await api.approveTask('task_demo_investigate_inc_demo_02')).task.status).toBe('approved')
  })

  it('leaves the single-incident fixtures unchanged', () => {
    expect(regionFixtures()[0]).toEqual(fixture('conflict'))
  })
})

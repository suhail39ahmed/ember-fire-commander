import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createMockSupervisorApi } from '../../api/mock'
import { fixture } from '../../fixtures'
import { hasMapsKey } from '../config'
import { regionFixtures } from '../fixtures'
import { IncidentMap } from '../IncidentMap'
import { loadMaps } from '../loadMaps'
import { crewDots, PIN_COLOR, pinStyle, placeable, project, projectWithCrews } from '../markers'
import { layerView } from '../layers'
import { mapCopy } from '../mapCopy'
import { arrowDeg, compass, windReading, windText } from '../wind'

const region = () => regionFixtures().map((d) => d.incident)
const render = (props: Partial<Parameters<typeof IncidentMap>[0]> = {}) =>
  renderToStaticMarkup(
    <IncidentMap incidents={region()} selectedId="inc_demo_02" onSelect={() => undefined} mapsKey="" {...props} />,
  )

describe('pin rules', () => {
  it('labels pins with the incident name, or its place for an unnamed one', () => {
    const [conflict, normal] = region()
    expect(pinStyle(normal).label).toBe('Ketapang, Kalimantan Barat · Sari · #2 · Open · Small flame')
    expect(pinStyle({ ...conflict, name: null, id: '4kQ9xZ7hLm' }).label).toMatch(/^Incident · Ketapang, Kalimantan Barat · /)
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

  it('shows the Fires, Crews and peat toggles, and no Satellite toggle', () => {
    const html = render({ showLayers: true })
    expect(html).toContain('Live map')
    expect(html).toContain('aria-pressed="true">Fires')
    expect(html).toContain('>Crews<')
    expect(html).toContain('Peat dryness · Static')
    expect(html).toContain('class="map-pin')
    expect(html).not.toMatch(/Satellite|satelit/i)
    expect(html).not.toContain('km/h')
  })

  it('has no Wind toggle without a stored wind, and one with it', () => {
    expect(render({ showLayers: true })).not.toContain('>Wind<')
    expect(render({ showLayers: true, wind: { kmh: 14, fromDeg: 225 } })).toContain('>Wind<')
  })

  it('draws the wind as an arrow and a label only when the layer is on', () => {
    // Static markup cannot click, so the label and arrow are checked through the helpers.
    expect(windText({ kmh: 14.04, fromDeg: 225 }, 'en')).toBe('Wind 14 km/h from SW (225°)')
    expect(windText({ kmh: 8, fromDeg: 0 }, 'id')).toBe('Angin 8 km/h dari U (0°)')
    expect(arrowDeg(225)).toBe(45)
    expect(arrowDeg(180)).toBe(0)
    expect(arrowDeg(350)).toBe(170)
    expect(compass(337.5)).toBe('N')
    expect(compass(-45)).toBe('NW')
    expect(windReading(14, 725)).toEqual({ kmh: 14, fromDeg: 5 })
    expect(windReading(null, 10)).toBeNull()
    expect(windReading(10, null)).toBeNull()
    expect(windReading(-1, 10)).toBeNull()
    expect(windReading(Number.NaN, 10)).toBeNull()
    expect(windReading(undefined, undefined)).toBeNull()
  })

  it('says the Fires layer is a toggle when it is off', () => {
    expect(mapCopy.firesOff.en).toBe('Fires layer is off. Press Fires to turn it on.')
    expect(mapCopy.firesOff.id).toContain('Tekan Kebakaran')
  })

  it('puts the crew dots in the same box as the incidents, north up', () => {
    const cards = [
      card('uid_a', -1.85, 110.05),
      card('uid_b', -1.9, 110.1),
      card('uid_none', null, null),
      card('uid_far', 95, 10),
      card('uid_nan', Number.NaN, 1),
    ]
    const crews = crewDots(cards)
    expect(crews.map((c) => c.id)).toEqual(['uid_a', 'uid_b'])
    const placed = projectWithCrews(region(), crews, 640, 300)
    expect(placed.incidents).toHaveLength(3)
    expect(placed.crews).toHaveLength(2)
    expect(new Set(placed.crews.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).size).toBe(2)
    expect(crewDots(null)).toEqual([])
    expect(projectWithCrews([], [], 640, 300)).toEqual({ incidents: [], crews: [] })
  })

  it('draws no crew dot until the Crews layer is on, and never invents one', () => {
    const crews = crewDots([card('uid_a', -1.85, 110.05)])
    expect(render({ showLayers: true, crews })).not.toContain('map-crew')
    expect(render({ crews })).not.toContain('map-crew')
  })
})

function card(volunteerId: string, lat: number | null, lng: number | null) {
  return {
    volunteerId, name: null, reportCount: 1, firstReportAt: null, lastReportAt: null, lastSeverity: null, lastLat: lat, lastLng: lng,
    lastAccuracyM: null, distanceM: null, lastHeardAt: null, pushReady: false, withdraw: null,
  }
}

describe('IncidentMap (continued)', () => {
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

describe('layer toggles', () => {
  const [a, b] = region()
  const crews = crewDots([card('uid_a', -1.85, 110.05)])
  const wind = { kmh: 14, fromDeg: 225 }
  const on = { showLayers: true, firesOn: true, crewsOn: false, windOn: false }

  it('Fires off hides the incidents and says how to turn them back on', () => {
    const v = layerView({ ...on, firesOn: false }, [a, b], crews, wind)
    expect(v.incidents).toEqual([])
    expect(v.empty).toBe('firesOff')
  })

  it('Fires off with Crews on shows the crews alone, not the empty message', () => {
    const v = layerView({ ...on, firesOn: false, crewsOn: true }, [a, b], crews, wind)
    expect(v.incidents).toEqual([])
    expect(v.crews).toHaveLength(1)
    expect(v.empty).toBeNull()
  })

  it('Crews off draws no crew dot, Crews on draws every stored position', () => {
    expect(layerView(on, [a], crews, wind).crews).toEqual([])
    expect(layerView({ ...on, crewsOn: true }, [a], crews, wind).crews).toEqual(crews)
  })

  it('Crews on with nothing stored says so instead of drawing', () => {
    const v = layerView({ ...on, crewsOn: true }, [a], [], wind)
    expect(v.crews).toEqual([])
    expect(v.crewsNone).toBe(true)
    expect(layerView(on, [a], [], wind).crewsNone).toBe(false)
  })

  it('Wind shows only when its toggle is on and a reading exists', () => {
    expect(layerView(on, [a], [], wind).wind).toBeNull()
    expect(layerView({ ...on, windOn: true }, [a], [], wind).wind).toEqual(wind)
    expect(layerView({ ...on, windOn: true }, [a], [], null).wind).toBeNull()
  })

  it('without the toggles every incident is drawn and the extra layers are not', () => {
    const v = layerView({ ...on, showLayers: false, firesOn: false, crewsOn: true, windOn: true }, [a, b], crews, wind)
    expect(v.incidents).toHaveLength(2)
    expect(v.crews).toEqual([])
    expect(v.wind).toBeNull()
  })

  it('says there are no positions when there is nothing to draw at all', () => {
    expect(layerView(on, [], [], null).empty).toBe('noPositions')
    expect(layerView(on, [{ ...a, lat: Number.NaN }], [], null).empty).toBe('noPositions')
  })
})

import type { Incident } from '../contracts'
import type { CrewDot } from './markers'
import { placeable } from './markers'
import type { WindReading } from './wind'

export interface LayerState {
  /** The dashboard toggles are on screen. Without them every layer is simply drawn. */
  showLayers: boolean
  firesOn: boolean
  crewsOn: boolean
  windOn: boolean
}

export interface LayerView {
  incidents: Incident[]
  crews: CrewDot[]
  /** What to say instead of a map: the Fires toggle is off with nothing else to draw, or there is nothing at all. */
  empty: 'firesOff' | 'noPositions' | null
  /** Crews is on and the open incident has none stored. */
  crewsNone: boolean
  /** The wind line to draw: only when its toggle is on and a reading exists. */
  wind: WindReading | null
}

/** What each toggle does to the map. Pure, so it can be tested without a browser. */
export function layerView(state: LayerState, incidents: Incident[], crews: CrewDot[], wind: WindReading | null): LayerView {
  const shownIncidents = state.showLayers && !state.firesOn ? [] : incidents
  const shownCrews = !state.showLayers || state.crewsOn ? crews : []
  let empty: LayerView['empty'] = null
  if (state.showLayers && !state.firesOn && shownCrews.length === 0) empty = 'firesOff'
  else if (shownCrews.length === 0 && placeable(incidents).length === 0) empty = 'noPositions'
  return {
    incidents: shownIncidents,
    crews: shownCrews,
    empty,
    crewsNone: state.showLayers && state.crewsOn && crews.length === 0,
    wind: state.showLayers && state.windOn ? wind : null,
  }
}

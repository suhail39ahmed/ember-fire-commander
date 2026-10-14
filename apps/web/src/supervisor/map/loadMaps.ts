/**
 * Loads the Maps JavaScript API with the browser key, once per page.
 * Only the map, its tiles and markers come from Google. Incident data comes
 * from ember-api; no geocoding, places, weather or routing calls are made.
 * No npm package is needed: this uses the documented script loader.
 */

export interface LatLng {
  lat: number
  lng: number
}

export interface GMap {
  panTo(p: LatLng): void
  fitBounds(bounds: GLatLngBounds, padding?: number): void
  setCenter(p: LatLng): void
  setZoom(z: number): void
}

export interface GLatLngBounds {
  extend(p: LatLng): GLatLngBounds
}

export interface GMarker {
  map: GMap | null
  addListener(event: 'click', fn: () => void): void
}

export interface GCircle {
  setMap(map: GMap | null): void
}

export interface MapsApi {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap
  LatLngBounds: new () => GLatLngBounds
  Circle: new (opts: Record<string, unknown>) => GCircle
  AdvancedMarkerElement: new (opts: { map: GMap; position: LatLng; content: HTMLElement; title: string; gmpClickable?: boolean }) => GMarker
}

interface GoogleGlobal {
  maps: { importLibrary(name: string): Promise<Record<string, unknown>> }
}

const CALLBACK = '__emberMapsReady'
let pending: Promise<MapsApi> | null = null

export function loadMaps(key: string): Promise<MapsApi> {
  if (pending) return pending
  pending = new Promise<MapsApi>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Maps needs a browser'))
      return
    }
    const w = window as unknown as Record<string, unknown> & { google?: GoogleGlobal }
    const finish = async () => {
      try {
        const g = w.google as GoogleGlobal
        const maps = await g.maps.importLibrary('maps')
        const marker = await g.maps.importLibrary('marker')
        const core = await g.maps.importLibrary('core')
        resolve({
          Map: maps.Map,
          Circle: maps.Circle,
          LatLngBounds: core.LatLngBounds,
          AdvancedMarkerElement: marker.AdvancedMarkerElement,
        } as MapsApi)
      } catch (e) {
        reject(e)
      }
    }
    if (w.google?.maps?.importLibrary) {
      void finish()
      return
    }
    w[CALLBACK] = () => void finish()
    const script = document.createElement('script')
    const params = new URLSearchParams({ key, v: 'weekly', loading: 'async', callback: CALLBACK })
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.onerror = () => {
      pending = null
      reject(new Error('Maps failed to load'))
    }
    document.head.appendChild(script)
  })
  return pending
}

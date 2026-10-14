/** Public Maps settings from Vite env. The browser key only loads map tiles. */
const env = import.meta.env

export const MAPS_BROWSER_KEY: string = (env.VITE_MAPS_BROWSER_KEY || '').trim()
export const MAPS_MAP_ID: string = (env.VITE_MAPS_MAP_ID || 'ember-map').trim()

/** Placeholder values from .env.example count as no key. */
export function hasMapsKey(key: string = MAPS_BROWSER_KEY): boolean {
  return key.length > 0 && !key.startsWith('your-')
}

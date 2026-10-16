/** Message the page sends to the service worker (public/sw.js) with the built files it loaded. */
export const CACHE_ASSETS_MESSAGE = 'ember-cache-assets'

/** Most files sent in one message. The worker keeps the same limit. */
export const MAX_ASSET_URLS = 80

/**
 * The built `/assets/` files this page used, from the browser's resource timing entries. Scripts, styles and the lazy
 * chunks loaded after sign-in all appear there, so the worker can keep what an offline launch needs.
 */
export function assetPathsFrom(entries: ReadonlyArray<{ name: string }>, origin: string): string[] {
  const paths: string[] = []
  for (const entry of entries) {
    let url: URL
    try {
      url = new URL(entry.name)
    } catch {
      continue
    }
    if (url.origin !== origin || !url.pathname.startsWith('/assets/')) continue
    if (!paths.includes(url.pathname)) paths.push(url.pathname)
    if (paths.length === MAX_ASSET_URLS) break
  }
  return paths
}

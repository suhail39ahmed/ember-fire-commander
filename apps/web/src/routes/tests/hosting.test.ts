import { describe, expect, it } from 'vitest'

import firebaseJson from '../../../firebase.json?raw'
import indexHtml from '../../../index.html?raw'
import manifestJson from '../../../public/manifest.webmanifest?raw'
import viteConfig from '../../../vite.config.ts?raw'

type Header = { key: string; value: string }
type Rule = { source: string; headers: Header[] }

function rules(): Rule[] {
  return (JSON.parse(firebaseJson) as { hosting: { headers: Rule[] } }).hosting.headers
}

/** Every value a rule sets for one header name. */
function valuesFor(source: string, key: string): string[] {
  return rules()
    .filter((r) => r.source === source)
    .flatMap((r) => r.headers.filter((h) => h.key === key).map((h) => h.value))
}

describe('hosting and page shell', () => {
  it('declares the page language and the standard web-app meta tag', () => {
    expect(indexHtml).toContain('<html lang="id">')
    expect(indexHtml).toContain('<meta name="mobile-web-app-capable" content="yes" />')
  })

  it('keeps the manifest language in step with the default UI language', () => {
    const manifest = JSON.parse(manifestJson) as { lang: string; name: string; start_url: string }
    expect(manifest.lang).toBe('id')
    expect(manifest.name).toContain('Relawan')
  })

  it('opens the installed app on the volunteer page', () => {
    const manifest = JSON.parse(manifestJson) as { start_url: string }
    expect(manifest.start_url.startsWith('/pwa')).toBe(true)
  })

  it('lets the sign-in pop-up talk to its opener', () => {
    const config = JSON.parse(firebaseJson) as { hosting: { headers: { source: string; headers: { key: string; value: string }[] }[] } }
    const all = config.hosting.headers.find((h) => h.source === '**')
    expect(all?.headers).toContainEqual({ key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' })
  })

  it('caches hashed build files for a year and never revalidates them', () => {
    expect(valuesFor('/assets/**', 'Cache-Control')).toEqual(['public, max-age=31536000, immutable'])
    // Vite writes hashed files to dist/assets unless the build overrides it.
    expect(viteConfig).not.toContain('assetsDir')
  })

  it('always revalidates the page shell, the service worker and the manifest', () => {
    for (const source of ['/', '/index.html', '/sw.js', '/manifest.webmanifest', '**/!(*.*)']) {
      expect(valuesFor(source, 'Cache-Control')).toEqual(['no-cache'])
    }
  })

  it('never gives a no-cache rule and the immutable rule the same path', () => {
    const cacheSources = rules().filter((r) => r.headers.some((h) => h.key === 'Cache-Control')).map((r) => r.source)
    expect(new Set(cacheSources).size).toBe(cacheSources.length)
    expect(cacheSources).not.toContain('**')
  })

  it('sends the security headers on every response', () => {
    const all = rules().find((r) => r.source === '**')?.headers ?? []
    expect(all).toContainEqual({ key: 'X-Content-Type-Options', value: 'nosniff' })
    expect(all).toContainEqual({ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' })
  })

  it('keeps camera, microphone and location for the app itself', () => {
    const policy = valuesFor('**', 'Permissions-Policy')[0]
    expect(policy).toContain('camera=(self)')
    expect(policy).toContain('microphone=(self)')
    expect(policy).toContain('geolocation=(self)')
    // Notifications are not a Permissions-Policy feature, so naming them would only log a console warning.
    expect(policy).not.toContain('notifications')
  })

  it('refuses to be framed, except for the sign-in helper pages under /__/', () => {
    expect(valuesFor('!/__/**', 'X-Frame-Options')).toEqual(['DENY'])
    expect(valuesFor('**', 'X-Frame-Options')).toEqual([])
  })

  it('does not enforce a Content-Security-Policy that could block sign-in, maps, App Check or push', () => {
    const keys = rules().flatMap((r) => r.headers.map((h) => h.key))
    expect(keys).not.toContain('Content-Security-Policy')
  })

  it('still serves every route from index.html', () => {
    const config = JSON.parse(firebaseJson) as { hosting: { rewrites: { source: string; destination: string }[] } }
    expect(config.hosting.rewrites).toEqual([{ source: '**', destination: '/index.html' }])
  })
})

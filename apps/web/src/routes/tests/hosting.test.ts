import { describe, expect, it } from 'vitest'

import firebaseJson from '../../../firebase.json?raw'
import indexHtml from '../../../index.html?raw'
import manifestJson from '../../../public/manifest.webmanifest?raw'

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
})

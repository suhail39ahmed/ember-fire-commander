import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PermissionsPanel } from '../install/PermissionsPanel'
import type { Perms, Platform } from '../permissions/permState'
import { permHint, permStrings } from '../permissions/permStrings'
import type { Asking } from '../permissions/usePermissions'

const all = (state: Perms[keyof Perms]): Perms => ({ microphone: state, camera: state, location: state, notifications: state })
const render = (perms: Perms, asking: Asking = {}, lang: 'en' | 'id' = 'en', platform: Platform = 'other') =>
  renderToStaticMarkup(<PermissionsPanel perms={perms} asking={asking} lang={lang} platform={platform} onRequest={() => undefined} />)
const row = (html: string, key: string) => html.match(new RegExp(`<li[^>]*data-testid="perm-${key}"[\\s\\S]*?</li>`))![0]

describe('PermissionsPanel', () => {
  it('makes the whole prompt row actionable with the permission hint', () => {
    const html = render(all('prompt'))
    const mic = row(html, 'microphone')
    expect(mic).toContain('Needed for push-to-talk')
    expect(mic).toContain('class="perm-row-action"')
    expect(mic).toContain('>Not allowed<')
    expect(mic).toContain('aria-label="Allow Microphone"')
    expect(row(html, 'camera')).toContain('Live video and photos')
  })

  it('shows Asking with a disabled button and the prompt hint while the browser prompt is open', () => {
    const mic = row(render(all('prompt'), { microphone: true }), 'microphone')
    expect(mic).toContain('data-state="asking"')
    expect(mic).toContain('Check the browser prompt')
    expect(mic).toMatch(/<button[^>]*disabled/)
    expect(mic).toContain('>Asking<')
    expect(mic).not.toContain('>Allow<')
  })

  it('shows ✓ Allowed once granted, even if Asking has not cleared yet', () => {
    const mic = row(render(all('granted'), { microphone: true }), 'microphone')
    expect(mic).toContain('✓ Allowed')
    expect(mic).toContain('Ready to use')
    expect(mic).not.toContain('<button')
  })

  it('shows Blocked with steps to re-enable when denied, and adapts them to the platform', () => {
    const denied = all('denied')
    expect(row(render(denied), 'notifications')).toContain('Site settings → Notifications → Allow')
    expect(row(render(denied), 'notifications')).toContain('>Blocked<')
    expect(row(render(denied), 'notifications')).not.toContain('<button')
    expect(row(render(denied, {}, 'en', 'ios'), 'microphone')).toContain('Settings → Safari → Microphone → Allow')
    expect(row(render(denied, {}, 'en', 'android'), 'camera')).toContain('Tap the lock icon → Permissions → Camera → Allow')
    expect(row(render(denied, {}, 'id'), 'microphone')).toContain('Pengaturan situs → Mikrofon → Izinkan')
  })

  it('shows Not supported without an Allow button', () => {
    const cam = row(render(all('unsupported')), 'camera')
    expect(cam).toContain('Not supported')
    expect(cam).not.toContain('<button')
  })

  it('shows actual GPS accuracy only on a granted location row', () => {
    const panel = (state: Perms[keyof Perms], accuracyM: number | null) => renderToStaticMarkup(<PermissionsPanel perms={all(state)} lang="en" onRequest={() => undefined} accuracyM={accuracyM} />)
    expect(row(panel('granted', 18.4), 'location')).toContain('±18 m')
    expect(row(panel('granted', null), 'location')).toContain('Attached to every report')
    expect(row(panel('denied', 18), 'location')).not.toContain('±18 m')
    expect(row(panel('granted', NaN), 'location')).not.toContain('NaN')
  })

  it('shows LIVE without the readiness summary', () => {
    const html = render({ microphone: 'granted', camera: 'prompt', location: 'granted', notifications: 'denied' })
    expect(html).not.toContain('not asked yet')
    expect(html).toContain('>LIVE<')
    expect(html).not.toContain('of 4 ready')
    expect(render(all('granted'))).not.toContain('of 4 ready')
  })

  it('renders one row per permission, each with the same structure in every state', () => {
    const shape = (html: string) => (html.match(/<li[^>]*>(?:(?!<\/li>)[\s\S])*<\/li>/g) ?? []).map((li) => li.match(/class="(perm-icon|perm-text|perm-end)"/g)?.join())
    const states: Perms[keyof Perms][] = ['prompt', 'granted', 'denied', 'unsupported']
    const shapes = new Set(states.map((s) => JSON.stringify(shape(render(all(s))))))
    shapes.add(JSON.stringify(shape(render(all('prompt'), { microphone: true, camera: true }))))
    expect(shapes.size).toBe(1)
  })
})

describe('permHint', () => {
  it('has copy in both languages for every permission and state', () => {
    for (const key of ['microphone', 'camera', 'location', 'notifications'] as const) {
      for (const state of ['prompt', 'asking', 'granted', 'denied', 'unsupported'] as const) {
        const leaf = permHint(key, state, 'other')
        expect(leaf.en.length).toBeGreaterThan(0)
        expect(leaf.id.length).toBeGreaterThan(0)
      }
    }
    expect(permStrings.summary(3, 4).en).toBe('3 of 4 ready')
  })
})

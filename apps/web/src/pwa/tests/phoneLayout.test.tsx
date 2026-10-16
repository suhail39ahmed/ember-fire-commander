import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { digest, incident, outboxHandle, renderVolunteer, task, fakeBrowser, volunteerValue } from './volunteerKit'

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ signOut: async () => undefined, user: null, me: null }) }))

import { PhoneLayout } from '../layout/PhoneLayout'

fakeBrowser()

const layout = (path: string, over = {}, lang: 'id' | 'en' = 'en') => renderVolunteer(<Routes><Route path="/pwa/*" element={<PhoneLayout />} /></Routes>, { path, lang, value: volunteerValue(over) })

describe('phone layout (#121)', () => {
  it('draws the header, the content and the five tabs once, in order', () => {
    const html = layout('/pwa')
    expect(html.match(/<header/g)).toHaveLength(1)
    expect(html.match(/<nav/g)).toHaveLength(1)
    const order = ['tab-home', 'tab-incidents', 'tab-report', 'tab-guide', 'tab-profile'].map((id) => html.indexOf(`data-testid="${id}"`))
    expect(order.every((n) => n > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('shows the crew from the profile in the header, never the fictional crew', () => {
    const html = layout('/pwa')
    expect(html).toContain('Regu Tohor')
    expect(html).not.toContain('Crew A')
    expect(html).not.toContain('fiktif')
  })

  it('marks the tab that matches the screen', () => {
    const active = (path: string) => [...layout(path).matchAll(/<a[^>]*data-testid="tab-(\w+)"[^>]*aria-current="page"/g)].map((m) => m[1])
    expect(active('/pwa')).toEqual(['home'])
    expect(active('/pwa/incidents')).toEqual(['incidents'])
    expect(active('/pwa/report')).toEqual(['report'])
    expect(active('/pwa/guide')).toEqual(['guide'])
    expect(active('/pwa/guide/practice')).toEqual(['guide'])
    expect(active('/pwa/profile')).toEqual(['profile'])
  })

  it('names the tabs in Bahasa first and in English on request', () => {
    expect(layout('/pwa', {}, 'id')).toContain('Beranda')
    expect(layout('/pwa', {}, 'en')).toContain('Home')
  })

  it('covers the tabs with WITHDRAW, drawn after them', () => {
    const withdraw = incident({ withdraw: { active: true, instruction: 'Mundur', reasons: [], volunteerIds: ['vol_1'] } })
    const html = layout('/pwa/incidents', { digest: digest({ incidents: [withdraw] }) })
    expect(html.indexOf('class="withdraw"')).toBeGreaterThan(html.indexOf('class="tabbar"'))
  })

  it('has no WITHDRAW cover when nothing is in force', () => {
    expect(layout('/pwa')).not.toContain('class="withdraw"')
  })
})

describe('Home (#127)', () => {
  it('shows a skeleton, not a text line, until the digest returns', () => {
    const html = layout('/pwa', { digest: null, digestStatus: 'loading', lastSyncAt: null })
    expect(html).toContain('data-testid="home-skeleton"')
    expect(html).toContain('aria-busy="true"')
  })

  it('shows the waiting task and the counts from the digest', () => {
    const html = layout('/pwa', { digest: digest({ incidents: [incident()], myTasks: [task()] }), outbox: outboxHandle({ items: [] }) })
    expect(html).toContain('/pwa/task/task_1')
    expect(html).toContain('Cek tepi kanal')
    expect(html).toContain('data-testid="incident-inc_1"')
    expect(html).toContain('SEE ALL')
  })

  it('hides the list and SEE ALL when there are no incidents', () => {
    const html = layout('/pwa', { digest: digest() })
    expect(html).toContain('data-testid="home-no-incidents"')
    expect(html).not.toContain('SEE ALL')
  })

  it('keeps one Report button and no wind card', () => {
    const html = layout('/pwa', { digest: digest({ incidents: [incident()] }) })
    expect(html.match(/report-cta/g)).toHaveLength(1)
    expect(html).not.toMatch(/wind|angin/i)
  })

  it('offline shows the last sync time and the queued count', () => {
    const html = layout('/pwa', { outbox: outboxHandle({ online: false, items: [{ id: 'a' } as never, { id: 'b' } as never] }) })
    expect(html).toContain('data-testid="home-offline"')
    expect(html).toContain('Last synced')
    expect(html).toMatch(/<strong>2<\/strong><span>waiting to send/)
  })

  it('offline before any sync says the time is unavailable instead of inventing one', () => {
    const html = layout('/pwa', { lastSyncAt: null, outbox: outboxHandle({ online: false }) })
    expect(html).toContain('Not available yet')
  })
})

describe('Profile (#152)', () => {
  it('shows the name, the crew, the language switch, appearance, permissions and sign out', () => {
    const html = layout('/pwa/profile')
    expect(html).toContain('Pak Dedi')
    expect(html).toContain('data-testid="profile-crew">Regu Tohor')
    expect(html).toContain('class="lang-toggle"')
    expect(html).toContain('theme-switch')
    expect(html).toContain('data-testid="perm-location"')
    expect(html).toContain('Sign out')
  })

  it('says no crew is set when /me has none', () => {
    const html = layout('/pwa/profile', { me: { id: 'vol_1', displayName: 'Pak Dedi', role: 'volunteer' } })
    expect(html).toContain('No crew set yet')
  })
})

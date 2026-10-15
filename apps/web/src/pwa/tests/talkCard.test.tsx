import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TalkCard } from '../gateway/TalkCard'
import type { SessionState } from '../gateway/pttSession'
import { talkView, type TalkInput } from '../gateway/voiceView'

const base: TalkInput = { voice: 'ready', session: 'idle', mic: 'granted', blocked: null }
const view = (over: Partial<TalkInput> = {}) => talkView({ ...base, ...over })
const render = (over: Partial<TalkInput> = {}, lang: 'en' | 'id' = 'en') =>
  renderToStaticMarkup(<TalkCard lang={lang} view={view(over)} onPress={() => undefined} onRelease={() => undefined} />)

describe('talkView', () => {
  it('shows an enabled Hold to talk with a matching status when voice is reachable', () => {
    const v = view()
    expect(v.button).toBe('ready')
    expect(v.disabled).toBe(false)
    expect(v.label.en).toBe('Hold to talk')
    expect(v.status.en).toBe('Voice ready · hold and speak Bahasa or English')
  })

  it('is disabled from load with the unavailable label and a matching status when voice is down', () => {
    const v = view({ voice: 'unavailable' })
    expect(v.button).toBe('unavailable')
    expect(v.disabled).toBe(true)
    expect(v.label.en).toBe('Voice unavailable · use quick report')
    expect(v.status.en).toBe('Voice service is down · chips and notes still send')
  })

  it('stays neutral and disabled while the check runs, so it never looks active first', () => {
    const v = view({ voice: 'checking' })
    expect(v.button).toBe('checking')
    expect(v.disabled).toBe(true)
  })

  it('tells a signed-out volunteer to sign in', () => {
    expect(view({ voice: 'signed_out' }).status.en).toBe('Sign in to talk.')
    expect(view({ blocked: 'auth' }).disabled).toBe(true)
  })

  it('goes unavailable when a press finds voice unusable after the check said ready', () => {
    const v = view({ blocked: 'unavailable' })
    expect(v.button).toBe('unavailable')
    expect(v.disabled).toBe(true)
  })

  it('says why when the microphone is blocked', () => {
    const v = view({ mic: 'denied' })
    expect(v.disabled).toBe(true)
    expect(v.status.en).toContain('Site settings → Microphone → Allow')
  })

  it('follows the session while voice is ready, and keeps the button usable so the volunteer can let go', () => {
    const expected: Record<SessionState, [string, string]> = {
      idle: ['ready', 'Hold to talk'],
      connecting: ['connecting', 'Connecting…'],
      live: ['listening', 'Listening · release to send'],
      waiting: ['replying', 'Coach is replying…'],
      lost: ['ready', 'Hold to talk'],
    }
    for (const [session, [button, label]] of Object.entries(expected) as [SessionState, [string, string]][]) {
      const v = view({ session })
      expect([v.button, v.label.en]).toEqual([button, label])
      expect(v.disabled).toBe(false)
    }
    expect(view({ session: 'lost' }).status.en).toBe('Connection lost. Withdraw still works.')
  })
})

describe('TalkCard', () => {
  it('renders the unavailable state up front with the button disabled and one status line', () => {
    const html = render({ voice: 'unavailable' })
    expect(html).toContain('data-state="unavailable"')
    expect(html).toMatch(/<button[^>]*disabled/)
    expect(html).toContain('Voice unavailable · use quick report')
    expect(html).toContain('Voice service is down')
    expect(html).not.toContain('Hold to talk')
  })

  it('always renders one button and one reserved status line, so the layout cannot shift', () => {
    const states: Partial<TalkInput>[] = [
      { voice: 'checking' },
      { voice: 'ready' },
      { voice: 'unavailable' },
      { voice: 'signed_out' },
      { session: 'live' },
      { session: 'waiting' },
      { mic: 'denied' },
    ]
    for (const over of states) {
      const html = render(over)
      expect(html.match(/<button/g)).toHaveLength(1)
      expect(html.match(/<p /g)).toHaveLength(1)
      expect(html).toContain('class="ptt-status"')
    }
  })

  it('has no separate Camera or Ready lines above the button', () => {
    const html = render()
    expect(html).not.toContain('Camera')
    expect(html.indexOf('<button')).toBeLessThan(html.indexOf('ptt-status'))
  })

  it('renders in Bahasa', () => {
    expect(render({ voice: 'unavailable' }, 'id')).toContain('Suara tidak tersedia')
  })
})

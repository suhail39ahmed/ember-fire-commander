import { describe, expect, it } from 'vitest'

import { digest, incident, renderVolunteer, task, talkView, fakeBrowser, volunteerValue } from './volunteerKit'
import { ConfirmSafe, HelpSent, WithdrawCleared, WithdrawCover } from '../screens/WithdrawViews'
import { CONFIRM_AFTER_MS, WithdrawMemory, findWithdraw, othersCount, stepOf, withdrawKey } from '../withdraw/state'
import type { Withdraw } from '../contracts/types'

fakeBrowser()

const order: Withdraw = {
  active: true,
  instruction: 'Withdraw upwind. Do not engage.',
  reasons: ['large flame reported'],
  volunteerIds: ['vol_1', 'vol_2', 'vol_3'],
  source: 'code',
  sentAt: '2026-10-16T07:21:00Z',
  safeVolunteerIds: [],
}
const talk = { view: talkView, onPress: () => undefined, onRelease: () => undefined }
const render = (el: JSX.Element, lang: 'id' | 'en' = 'en') => renderVolunteer(el, { path: '/pwa', lang, value: volunteerValue() })

class MemStore {
  data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
}

describe('finding the order', () => {
  it('uses the incident withdraw that lists this volunteer', () => {
    const d = digest({ incidents: [incident({ withdraw: order })] })
    const found = findWithdraw(d, 'vol_1', null)
    expect(found?.incidentId).toBe('inc_1')
    expect(found?.instruction).toBe('Withdraw upwind. Do not engage.')
    expect(findWithdraw(d, 'vol_9', null)).toBeNull()
  })

  it('falls back to a withdraw task with its incident', () => {
    const found = findWithdraw(digest(), 'vol_1', task({ type: 'withdraw', instruction: 'Mundur', incidentId: 'inc_7' }))
    expect(found).toMatchObject({ incidentId: 'inc_7', withdraw: null, instruction: 'Mundur' })
    expect(findWithdraw(digest(), 'vol_1', task({ type: 'verify' }))).toBeNull()
  })

  it('gives a new order a new key, so an old answer is not reused', () => {
    const a = findWithdraw(digest({ incidents: [incident({ withdraw: order })] }), 'vol_1', null)!
    const b = findWithdraw(digest({ incidents: [incident({ withdraw: { ...order, sentAt: '2026-10-16T09:00:00Z' } })] }), 'vol_1', null)!
    expect(withdrawKey(a)).not.toBe(withdrawKey(b))
  })

  it('counts the other volunteers on the order', () => {
    expect(othersCount(order, 'vol_1')).toBe(2)
    expect(othersCount(null, 'vol_1')).toBe(0)
  })
})

describe('the step the volunteer is on (#146, #147)', () => {
  const base = { answer: null, supervisorSafe: false, shownAtMs: 1000 }
  it('starts on the order and asks for confirmation after the delay', () => {
    expect(stepOf({ ...base, nowMs: 1000 + CONFIRM_AFTER_MS - 1 })).toBe('cover')
    expect(stepOf({ ...base, nowMs: 1000 + CONFIRM_AFTER_MS })).toBe('confirm')
  })
  it('stops asking once the volunteer answered, or a supervisor marked them safe', () => {
    expect(stepOf({ ...base, answer: 'safe', nowMs: 1e9 })).toBe('safe')
    expect(stepOf({ ...base, supervisorSafe: true, nowMs: 1e9 })).toBe('safe')
    expect(stepOf({ ...base, answer: 'stuck', supervisorSafe: true, nowMs: 1e9 })).toBe('stuck')
  })
})

describe('what the phone remembers', () => {
  it('keeps an answer for its own order only', () => {
    const store = new MemStore()
    const memory = new WithdrawMemory(store)
    memory.saveAnswer('inc_1@a', 'stuck', '2026-10-16T07:30:00Z')
    expect(new WithdrawMemory(store).answer('inc_1@a')).toEqual({ state: 'stuck', at: '2026-10-16T07:30:00Z' })
    expect(new WithdrawMemory(store).answer('inc_1@b')).toBeNull()
  })

  it('keeps the order that was shown until it is dismissed', () => {
    const store = new MemStore()
    const memory = new WithdrawMemory(store)
    const shown = { key: 'k', incidentId: 'inc_1', sentAt: null, source: null, reasons: ['x'], instruction: null, shownAtMs: 5 }
    memory.saveShown(shown)
    expect(memory.shown()).toEqual(shown)
    memory.clearShown()
    expect(memory.shown()).toBeNull()
  })

  it('forgets quietly when storage is missing or holds junk', () => {
    expect(new WithdrawMemory(null).answer('k')).toBeNull()
    const store = new MemStore()
    store.setItem('ember.withdraw.shown', '{not json')
    expect(new WithdrawMemory(store).shown()).toBeNull()
  })
})

describe('WITHDRAW step 1 (#146)', () => {
  const cover = (over = {}, lang: 'id' | 'en' = 'en') =>
    render(<WithdrawCover lang={lang} instruction={order.instruction} sentAt={order.sentAt!} source="code" reasons={order.reasons} others={2} note={null} talk={talk} {...over} />, lang)

  it('says when it was sent and by whom, from the order', () => {
    const html = cover()
    expect(html).toContain('SAFETY RULE')
    expect(html).toContain('SENT BY CODE')
    expect(html).toContain('Withdraw upwind. Do not engage.')
    expect(html).toContain('large flame reported')
    expect(html).toContain('Sent to you and 2 other volunteers.')
  })

  it('leaves the head short when the order has no time or source', () => {
    const html = cover({ sentAt: null, source: null, reasons: [], others: 0 })
    expect(html).toMatch(/data-testid="withdraw-head">SAFETY RULE</)
    expect(html).toContain('Sent to you.')
  })

  it('names the supervisor when a supervisor sent it, and speaks Bahasa first', () => {
    expect(cover({ source: 'supervisor' }, 'id')).toContain('DIKIRIM OLEH SUPERVISOR')
  })

  it('offers hold to talk and no close button, and no wind it does not have', () => {
    const html = cover()
    expect(html).toContain('Hold to talk')
    expect(html).toContain("You can&#x27;t close it.")
    expect(html).not.toMatch(/data-testid="withdraw-safe"/)
    expect(html).not.toMatch(/Open-Meteo|km\/h|Upwind is/)
  })

  it('shows the noted line once answered', () => {
    expect(cover({ note: 'Noted: you are safe.' })).toContain('data-testid="withdraw-note"')
  })
})

describe('WITHDRAW step 2 (#147)', () => {
  const confirm = (action = { kind: 'idle' } as const) =>
    render(<ConfirmSafe lang="en" instruction={order.instruction} sentAt={order.sentAt!} action={action} onSafe={() => undefined} onStuck={() => undefined} />)

  it('asks the question and offers both answers', () => {
    const html = confirm()
    expect(html).toContain('Are you somewhere safe?')
    expect(html).toContain('STILL IN FORCE')
    expect(html).toContain("I&#x27;m safe")
    expect(html).toContain("I can&#x27;t get out")
    expect(html).toContain('every 15 s')
  })

  it('does not claim the wind turned, who calls, or that the crew is told', () => {
    const html = confirm()
    expect(html).not.toMatch(/wind turned|calls you in|your crew/i)
  })

  it('disables both buttons while sending and shows a failure', () => {
    expect(confirm({ kind: 'busy' } as never).match(/disabled=""/g)).toHaveLength(2)
    expect(confirm({ kind: 'failed' } as never)).toContain('data-testid="withdraw-failed"')
  })
})

describe("I can't get out (#148)", () => {
  const help = (position: Parameters<typeof HelpSent>[0]['position'], batteryPct: number | null = null) =>
    render(<HelpSent lang="en" answeredAt="2026-10-16T07:30:00Z" position={position} batteryPct={batteryPct} action={{ kind: 'idle' }} talk={talk} onOut={() => undefined} />)

  it('says the position is shared, with accuracy and battery when known', () => {
    const html = help({ kind: 'ok', lat: 1, lng: 2, accuracyM: 12 }, 31)
    expect(html).toContain('Your supervisor can see where you are.')
    expect(html).toContain('Sharing your location every 10 s')
    expect(html).toContain('±12 m')
    expect(html).toContain('battery 31 %')
    expect(html).toContain('Hold to talk')
    expect(html).toContain("I&#x27;m out now")
  })

  it('does not claim the position is shared when the phone has none', () => {
    const html = help({ kind: 'unavailable' })
    expect(html).toContain('the phone has no location')
    expect(html).not.toContain('Sharing your location')
    expect(html).not.toContain('battery')
  })

  it('lists the safety tips for the wait, in Bahasa when asked', () => {
    const html = renderVolunteer(
      <HelpSent lang="id" answeredAt={null} position={{ kind: 'waiting' }} batteryPct={null} action={{ kind: 'idle' }} talk={talk} onOut={() => undefined} />,
      { path: '/pwa', lang: 'id', value: volunteerValue() },
    )
    expect(html).toContain('SAMBIL MENUNGGU')
    expect(html).toContain('Merunduk')
  })
})

describe('Withdraw lifted (#149)', () => {
  it('shows what the phone knows and no name or wind it was not given', () => {
    const html = render(<WithdrawCleared lang="en" sentAt={order.sentAt!} reasons={order.reasons} clearedAtMs={Date.parse('2026-10-16T07:58:00Z')} onDismiss={() => undefined} />)
    expect(html).toContain('WITHDRAW LIFTED')
    expect(html).toContain('Stay where you are.')
    expect(html).toContain('WITHDRAW SENT')
    expect(html).toContain('large flame reported')
    expect(html).toContain('GONE FROM THE LATEST DATA')
    expect(html).toContain("OK, standing by")
    expect(html).not.toMatch(/Bu Maya|CONFIRMED SAFE|WIND/)
  })
})

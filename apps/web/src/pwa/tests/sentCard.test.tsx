import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { formatTime } from '../formatTime'
import { OutboxPanel } from '../outbox/OutboxPanel'
import type { OutboxItem } from '../outbox/types'
import { SentCard } from '../report/SentCard'
import { statusLine } from '../report/status'

const at = new Date(2026, 9, 17, 14, 12).toISOString()
const card = (lang: 'id' | 'en', over: Partial<Parameters<typeof SentCard>[0]> = {}) =>
  renderToStaticMarkup(<SentCard lang={lang} kind="sent" at={at} chip="api" text="Small flame by the canal" onNew={() => {}} {...over} />)

describe('SentCard', () => {
  it('shows the send time as HH:mm in both languages', () => {
    expect(card('id')).toContain('14:12 · ')
    expect(card('en')).toContain('14:12 · ')
    expect(formatTime(at)).toBe('14:12')
  })

  it('shows what was sent, with the chip in the current language', () => {
    expect(card('en')).toContain('Fire (api)')
    expect(card('en')).toContain('“Small flame by the canal”')
    expect(card('id')).toContain('>api<')
  })

  it('leaves out the summary when the report had neither chip nor note', () => {
    expect(card('en', { chip: null, text: '  ' })).not.toContain('sent-summary')
  })

  it('has a New report button and a queued variant', () => {
    expect(card('en')).toContain('New report')
    expect(card('id')).toContain('Laporan baru')
    const queued = card('en', { kind: 'queued' })
    expect(queued).toContain('sent queued')
    expect(queued).toContain('Saved to outbox')
  })
})

describe('time in the outbox', () => {
  const item: OutboxItem = {
    id: 'i1',
    body: { source: 'chip', capturedAt: at, lat: -1.8, lng: 110, accuracyM: 12, chip: 'api', text: null },
    photo: null,
    state: 'sent',
    attempts: 1,
    lastError: null,
    queuedAt: at,
    sentAt: at,
    observationId: 'obs_1',
  }
  const outbox = (lang: 'id' | 'en') =>
    renderToStaticMarkup(<OutboxPanel items={[item]} online lang={lang} onRetry={() => {}} onDiscard={() => {}} onSendNow={() => {}} />)

  it('uses the same HH:mm as the success card, in both languages', () => {
    expect(outbox('id')).toContain('14:12')
    expect(outbox('en')).toContain('14:12')
    expect(outbox('id')).not.toContain('14.12')
  })

  it('lists the report with the chip label of the current language', () => {
    expect(outbox('en')).toContain('Fire (api)')
    expect(outbox('id')).toContain('>api<')
  })
})

describe('status line for an empty draft', () => {
  it('asks for a chip or a note until there is a draft', () => {
    expect(statusLine({ kind: 'idle' }, 'en', false).text).toBe('Pick a card or write a note to send.')
    expect(statusLine({ kind: 'idle' }, 'id', false).text).toContain('Pilih')
    expect(statusLine({ kind: 'idle' }, 'en', true).text).toBe('Your location is attached when you send.')
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { OutboxPanel } from '../outbox/OutboxPanel'
import type { OutboxItem } from '../outbox/types'

function failed(lastError: string): OutboxItem {
  return {
    id: 'a',
    body: { source: 'chip', capturedAt: '2026-10-16T08:00:00Z', lat: -1.8, lng: 110, accuracyM: 10, chip: 'api', text: null },
    photo: null,
    state: 'failed',
    attempts: 1,
    lastError,
    queuedAt: '2026-10-16T08:00:00Z',
    sentAt: null,
    observationId: null,
  }
}

const render = (item: OutboxItem, lang: 'id' | 'en') =>
  renderToStaticMarkup(<OutboxPanel items={[item]} online lang={lang} onRetry={() => {}} onDiscard={() => {}} onSendNow={() => {}} />)

describe('OutboxPanel failed report', () => {
  it('explains a time rejection as a phone clock problem', () => {
    const html = render(failed('capturedAt must not be more than 5 minutes in the future'), 'en')
    expect(html).toContain('clock looks wrong')
    expect(html).not.toContain('capturedAt')
  })

  it('shows other errors as they are', () => {
    expect(render(failed('lat must be a number'), 'id')).toContain('lat must be a number')
  })
})

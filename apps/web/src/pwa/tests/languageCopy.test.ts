import { describe, expect, it } from 'vitest'

import { strings } from '../i18n'
import { describeItem } from '../outbox/describeItem'
import { outboxStrings } from '../outbox/strings'
import type { OutboxItem } from '../outbox/types'
import { photoStrings } from '../photo/strings'

type Leaf = { id: string; en: string }

function leaves(node: unknown, path = ''): Array<[string, Leaf]> {
  if (node && typeof node === 'object' && 'id' in node && 'en' in node) return [[path, node as Leaf]]
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
  return []
}

const groups = { strings, outboxStrings, photoStrings }
const all = Object.entries(groups).flatMap(([name, g]) => leaves(g, name))

describe('UI copy', () => {
  it('has text in both languages for every string', () => {
    expect(all.length).toBeGreaterThan(50)
    for (const [path, leaf] of all) {
      expect(leaf.id.trim(), `${path} (id)`).not.toBe('')
      expect(leaf.en.trim(), `${path} (en)`).not.toBe('')
    }
  })

  it('does not use the Bahasa chip words as English labels', () => {
    for (const [path, leaf] of all) {
      expect(leaf.en, path).not.toMatch(/\b(asap|aman|butuh bantuan)\b/i)
    }
  })

  it('has no English chip labels in the Bahasa copy', () => {
    for (const [path, leaf] of all) {
      expect(leaf.id, path).not.toMatch(/\b(Smoke|Need help)\b/)
    }
  })
})

describe('describeItem (outbox line)', () => {
  const item = (body: OutboxItem['body']): OutboxItem => ({
    id: 'i1',
    body,
    photo: null,
    state: 'queued',
    attempts: 0,
    lastError: null,
    queuedAt: '2026-10-17T03:02:00Z',
    sentAt: null,
    observationId: null,
  })
  const chipBody = (chip: 'api' | 'butuh_bantuan', text: string | null): OutboxItem['body'] => ({
    source: 'chip',
    capturedAt: '2026-10-17T03:02:00Z',
    lat: -1.8,
    lng: 110,
    accuracyM: 12,
    chip,
    text,
  })

  it('names the chip in the current language', () => {
    expect(describeItem(item(chipBody('api', null)), 'id')).toBe('api')
    expect(describeItem(item(chipBody('api', null)), 'en')).toBe('Fire (api)')
  })

  it('appends the note', () => {
    expect(describeItem(item(chipBody('butuh_bantuan', 'near the canal')), 'en')).toBe('Need help (butuh bantuan) · near the canal')
  })

  it('translates the photo and waiting lines', () => {
    expect(describeItem(item(null), 'en')).toBe(outboxStrings.photoWaiting.en)
    expect(describeItem(item(null), 'id')).toBe(outboxStrings.photoWaiting.id)
  })
})

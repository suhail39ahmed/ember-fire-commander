import { describe, expect, it } from 'vitest'

import { clearDraft, DRAFT_KEY, isEmptyDraft, loadDraft, MAX_DRAFT_AGE_MS, saveDraft } from '../report/draft'

function memory() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  }
}

const NOW = new Date('2026-10-16T08:00:00.000Z')
const minutesLater = (m: number) => new Date(NOW.getTime() + m * 60_000)

describe('report draft', () => {
  it('brings back the chip and the note for the same volunteer', () => {
    const store = memory()
    saveDraft('vol_dedi', { chip: 'api', text: 'Api kecil di ladang' }, NOW, store)
    expect(loadDraft('vol_dedi', minutesLater(5), store)).toEqual({ chip: 'api', text: 'Api kecil di ladang' })
  })

  it('keeps only the chip and the note, never a position or a time of capture', () => {
    const store = memory()
    saveDraft('vol_dedi', { chip: 'asap', text: '' }, NOW, store)
    const keys = Object.keys(JSON.parse(store.data.get(DRAFT_KEY) as string)).sort()
    expect(keys).toEqual(['chip', 'savedAt', 'text', 'volunteerId'])
  })

  it('does not show one volunteer the draft of another on the same phone', () => {
    const store = memory()
    saveDraft('vol_dedi', { chip: 'api', text: 'x' }, NOW, store)
    expect(loadDraft('vol_other', NOW, store)).toBeNull()
  })

  it('drops a draft older than 60 minutes', () => {
    const store = memory()
    saveDraft('vol_dedi', { chip: 'api', text: 'x' }, NOW, store)
    expect(loadDraft('vol_dedi', new Date(NOW.getTime() + MAX_DRAFT_AGE_MS), store)).not.toBeNull()
    expect(loadDraft('vol_dedi', new Date(NOW.getTime() + MAX_DRAFT_AGE_MS + 1), store)).toBeNull()
  })

  it('removes the saved draft when the form is empty or cleared', () => {
    const store = memory()
    saveDraft('vol_dedi', { chip: 'api', text: '' }, NOW, store)
    saveDraft('vol_dedi', { chip: null, text: '   ' }, NOW, store)
    expect(store.data.has(DRAFT_KEY)).toBe(false)
    saveDraft('vol_dedi', { chip: 'api', text: '' }, NOW, store)
    clearDraft(store)
    expect(loadDraft('vol_dedi', NOW, store)).toBeNull()
  })

  it('ignores damaged or unknown stored values', () => {
    const store = memory()
    store.setItem(DRAFT_KEY, '{oops')
    expect(loadDraft('vol_dedi', NOW, store)).toBeNull()
    store.setItem(DRAFT_KEY, JSON.stringify({ volunteerId: 'vol_dedi', chip: 'bogus', text: '', savedAt: NOW.toISOString() }))
    expect(loadDraft('vol_dedi', NOW, store)).toBeNull()
    store.setItem(DRAFT_KEY, JSON.stringify({ volunteerId: 'vol_dedi', chip: 'bogus', text: 'catatan', savedAt: NOW.toISOString() }))
    expect(loadDraft('vol_dedi', NOW, store)).toEqual({ chip: null, text: 'catatan' })
  })

  it('works without storage and when storage throws', () => {
    expect(() => saveDraft('vol_dedi', { chip: 'api', text: 'x' }, NOW, null)).not.toThrow()
    expect(loadDraft('vol_dedi', NOW, null)).toBeNull()
    const broken = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('quota') },
      removeItem: () => { throw new Error('denied') },
    }
    expect(() => saveDraft('vol_dedi', { chip: 'api', text: 'x' }, NOW, broken)).not.toThrow()
    expect(loadDraft('vol_dedi', NOW, broken)).toBeNull()
    expect(() => clearDraft(broken)).not.toThrow()
  })

  it('treats a chip or a non-blank note as a draft', () => {
    expect(isEmptyDraft({ chip: null, text: '' })).toBe(true)
    expect(isEmptyDraft({ chip: 'aman', text: '' })).toBe(false)
    expect(isEmptyDraft({ chip: null, text: 'a' })).toBe(false)
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { SentReport } from '../contracts/types'
import { findSent, joinResultOf, type JoinResult } from '../report/joinResult'
import { joinSentence, joinShort } from '../report/joinText'
import { sentRows } from '../report/sentRows'
import { SentCard } from '../report/SentCard'
import { SentToday } from '../report/SentToday'
import { addSent, loadSentToday, updateSent, type SentEntry } from '../report/sentLog'

const at = new Date(2026, 9, 17, 14, 12).toISOString()

class MemStore {
  data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
}

const entry = (over: Partial<SentEntry> = {}): SentEntry => ({ at, capturedAt: at, kind: 'sent', chip: 'api', text: 'Small flame by the canal', accuracyM: 18, join: null, ...over })

const joinedNear: JoinResult = { incidentId: 'inc_1', label: 'TOHOR-3 · Desa Tohor · #3', joined: true, nearbyCount: 2, nearestM: 90, radiusM: 300 }
const startedHere: JoinResult = { incidentId: 'inc_2', label: 'TOHOR-6', joined: false, nearbyCount: 0, nearestM: null, radiusM: 300 }

function row(over: Partial<SentReport> = {}): SentReport {
  return { id: 'obs_1', capturedAt: at, receivedAt: new Date(2026, 9, 17, 14, 12, 5).toISOString(), source: 'chip', chip: 'api', text: 'Small flame by the canal', accuracyM: 18, join: null, ...over }
}

describe('the join ember-api recorded (#131, #132)', () => {
  it('words it for the phone with the incident label and never an id', () => {
    const j = joinResultOf({ incidentId: 'inc_13sWGNQce9QZLmgGQznA', incidentName: null, incidentArea: 'Desa Tohor', joined: true, nearbyCount: 1, nearestM: 40, radiusM: 300 }, 'en')
    expect(j).toEqual({ incidentId: 'inc_13sWGNQce9QZLmgGQznA', label: 'Incident · Desa Tohor', joined: true, nearbyCount: 1, nearestM: 40, radiusM: 300 })
    expect(joinResultOf({ incidentId: 'x', incidentName: null, incidentArea: null, joined: false, nearbyCount: 0, nearestM: null, radiusM: 300 }, 'id').label).toBe('Insiden')
  })

  it('finds this phone’s own report by the capturedAt it stamped, not by text', () => {
    const list = [row({ id: 'a', capturedAt: new Date(2026, 9, 17, 9, 0).toISOString() }), row({ id: 'b' })]
    expect(findSent(list, at)?.id).toBe('b')
    expect(findSent(list, new Date(2026, 9, 17, 14, 12, 0, 1).toISOString())).toBeNull()
    expect(findSent(undefined, at)).toBeNull()
    expect(findSent(list, 'not a time')).toBeNull()
  })

  it('says how many other reports were within the radius and how near the nearest was', () => {
    expect(joinSentence('en', joinedNear)).toBe('Your report joined TOHOR-3 · Desa Tohor · #3. 2 other reports within 300 m, nearest 90 m.')
    expect(joinSentence('en', { ...joinedNear, nearbyCount: 1, nearestM: 40 })).toContain('1 other report within 300 m, nearest 40 m.')
    expect(joinSentence('id', joinedNear)).toContain('2 laporan lain dalam 300 m, terdekat 90 m.')
    expect(joinShort('en', joinedNear)).toBe('2 other reports within 300 m, nearest 90 m.')
  })

  it('says no other report was within the radius when it started the incident, and never invents a distance', () => {
    expect(joinSentence('en', startedHere)).toBe('No other report within 300 m, so EMBER opened a new incident.')
    expect(joinShort('id', startedHere)).toBe('Tidak ada laporan lain dalam 300 m, jadi EMBER membuka insiden baru.')
    expect(joinSentence('en', { ...joinedNear, nearbyCount: 0, nearestM: null })).toContain('No other volunteer’s report within 300 m.')
  })
})

describe('the sent card', () => {
  const card = (props: Partial<Parameters<typeof SentCard>[0]> = {}, lang: 'id' | 'en' = 'en') =>
    renderToStaticMarkup(<SentCard lang={lang} kind="sent" at={at} chip="api" text="Small flame by the canal" onNew={() => undefined} {...props} />)

  it('shows the joined incident with the nearby count and the radius', () => {
    const html = card({ join: joinedNear })
    expect(html).toContain('14:12 · ')
    expect(html).toContain('Your report joined TOHOR-3 · Desa Tohor · #3. 2 other reports within 300 m, nearest 90 m.')
  })

  it('says it started the incident when nothing else was within the radius', () => {
    const html = card({ join: startedHere })
    expect(html).toContain('You started TOHOR-6')
    expect(html).toContain('No other report within 300 m')
    expect(html).not.toContain('Your report joined')
  })

  it('hides the join line while ember-api has not placed the report', () => {
    expect(card()).not.toContain('sent-join')
  })

  it('has Done only when the screen can go Home, and speaks Bahasa first', () => {
    expect(card()).not.toContain('data-testid="sent-done"')
    expect(card({ onDone: () => undefined })).toContain('data-testid="sent-done"')
    expect(card({ onDone: () => undefined, join: startedHere }, 'id')).toContain('Anda membuka TOHOR-6')
  })
})

describe('sent today', () => {
  it('lists the reports newest first with time, status, accuracy and where each went', () => {
    const rows = sentRows([], [row({ id: 'a', capturedAt: new Date(2026, 9, 17, 13, 40).toISOString(), chip: 'asap', text: 'Thin smoke', join: { incidentId: 'inc_2', incidentName: 'TOHOR-6', incidentArea: null, joined: false, nearbyCount: 0, nearestM: null, radiusM: 300 } }), row({ id: 'b', join: { incidentId: 'inc_1', incidentName: 'TOHOR-3', incidentArea: null, joined: true, nearbyCount: 2, nearestM: 90, radiusM: 300 } })], 'en')
    const html = renderToStaticMarkup(<SentToday lang="en" rows={rows} />)
    expect(html.indexOf('14:12')).toBeLessThan(html.indexOf('13:40'))
    expect(html).toContain('2 REPORTS')
    expect(html).toContain('FIRE · TOHOR-3 · ±18 M')
    expect(html).toContain('SMOKE · TOHOR-6 · ±18 M')
    expect(html).toContain('2 other reports within 300 m, nearest 90 m.')
    expect(html).toContain('No other report within 300 m, so EMBER opened a new incident.')
    expect(html).toContain('✓ Sent')
  })

  it('shows nothing before a first report, and Waiting for a queued one', () => {
    expect(renderToStaticMarkup(<SentToday lang="en" rows={[]} />)).toBe('')
    expect(renderToStaticMarkup(<SentToday lang="en" rows={sentRows([entry({ kind: 'queued' })], [], 'en')} />)).toContain('Waiting')
  })

  it('names a photo or voice report by its kind when it has no note', () => {
    const rows = sentRows([], [row({ id: 'p', source: 'photo', chip: null, text: null }), row({ id: 'l', source: 'live', chip: null, text: null, capturedAt: new Date(2026, 9, 17, 14, 30).toISOString() })], 'en')
    const html = renderToStaticMarkup(<SentToday lang="en" rows={rows} />)
    expect(html).toContain('Photo report')
    expect(html).toContain('Voice report')
  })

  it('shows ember-api’s row once, with the phone’s own entries only for what it does not list', () => {
    const queuedAt = new Date(2026, 9, 17, 15, 5).toISOString()
    const rows = sentRows([entry({ join: joinedNear }), entry({ at: queuedAt, capturedAt: queuedAt, kind: 'queued', text: 'Waiting one' })], [row({ id: 'listed' })], 'en')
    expect(rows.map((r) => r.key)).toEqual(['listed', `local-${queuedAt}`])
    // The API row has no join yet, so the phone's own join is kept.
    expect(rows[0].join).toEqual(joinedNear)
    expect(rows[1]).toMatchObject({ kind: 'queued', text: 'Waiting one' })
  })

  it('upgrades a queued entry to sent once the outbox has delivered it and ember-api lists it', () => {
    const rows = sentRows([entry({ kind: 'queued' })], [row({ id: 'listed' })], 'en')
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('sent')
  })

  it('keeps an entry saved before capturedAt was stored, since it cannot be matched', () => {
    expect(sentRows([entry({ capturedAt: null })], [row()], 'en')).toHaveLength(2)
  })

  it('falls back to the phone’s own record when ember-api cannot be read', () => {
    expect(sentRows([entry()], null, 'en')).toHaveLength(1)
  })
})

describe('the phone’s record of today’s reports', () => {
  const now = new Date(2026, 9, 17, 15, 0)

  it('keeps today’s reports for this volunteer only', () => {
    const store = new MemStore()
    addSent('vol_1', entry(), now, store)
    expect(loadSentToday('vol_1', now, store)).toHaveLength(1)
    expect(loadSentToday('vol_2', now, store)).toEqual([])
    expect(loadSentToday('vol_1', new Date(2026, 9, 18, 0, 5), store)).toEqual([])
  })

  it('fills in the incident later and keeps one row per report', () => {
    const store = new MemStore()
    addSent('vol_1', entry(), now, store)
    addSent('vol_1', entry(), now, store)
    const updated = updateSent('vol_1', at, { join: joinedNear }, now, store)
    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({ join: joinedNear })
  })

  it('keeps the join and the capturedAt across a reload, and drops a join that is not whole', () => {
    const store = new MemStore()
    addSent('vol_1', entry({ join: joinedNear }), now, store)
    expect(loadSentToday('vol_1', now, store)[0]).toMatchObject({ capturedAt: at, join: joinedNear })
    store.setItem('ember.report.sentToday', JSON.stringify({ volunteerId: 'vol_1', entries: [{ at, kind: 'sent', join: { incidentId: 'x' }, capturedAt: 'junk' }] }))
    expect(loadSentToday('vol_1', now, store)[0]).toMatchObject({ capturedAt: null, join: null })
  })

  it('forgets quietly when storage is missing or holds junk', () => {
    expect(loadSentToday('vol_1', now, null)).toEqual([])
    const store = new MemStore()
    store.setItem('ember.report.sentToday', 'nope')
    expect(loadSentToday('vol_1', now, store)).toEqual([])
    expect(addSent('vol_1', entry(), now, null)).toHaveLength(1)
  })
})

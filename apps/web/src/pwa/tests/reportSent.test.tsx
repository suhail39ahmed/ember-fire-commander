import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { IncidentDetail, Observation } from '../contracts/types'
import { findJoin } from '../report/joinResult'
import { SentCard } from '../report/SentCard'
import { SentToday } from '../report/SentToday'
import { addSent, loadSentToday, updateSent, type SentEntry } from '../report/sentLog'
import { incident } from './volunteerKit'

const at = new Date(2026, 9, 17, 14, 12).toISOString()

function obs(over: Partial<Observation> = {}): Observation {
  return {
    id: 'o1',
    volunteerId: 'vol_1',
    capturedAt: at,
    receivedAt: new Date(2026, 9, 17, 14, 12, 5).toISOString(),
    source: 'chip',
    lat: 1,
    lng: 2,
    accuracyM: 18,
    chip: 'api',
    text: 'Small flame by the canal',
    severity: 'small_flame',
    photoPath: null,
    immutable: true,
    ...over,
  }
}

function detail(observations: Observation[], over = {}): IncidentDetail {
  return { incident: { ...incident({ name: 'TOHOR-3 · Desa Tohor · #3' }), evidenceScore: null, conflictId: null, ...over }, observations, conflict: null, tasks: [] }
}

const sent = { volunteerId: 'vol_1', at, chip: 'api' as const, text: 'Small flame by the canal' }

class MemStore {
  data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
}

const entry = (over: Partial<SentEntry> = {}): SentEntry => ({ at, kind: 'sent', chip: 'api', text: 'Small flame by the canal', accuracyM: 18, incidentLabel: null, startedIncident: null, otherReports: null, ...over })

describe('finding the incident a report went into (#131, #132)', () => {
  it('finds it and counts the incident’s other reports from the API list', () => {
    const join = findJoin(sent, [detail([obs(), obs({ id: 'o2', volunteerId: 'vol_2' }), obs({ id: 'o3', volunteerId: 'vol_3' })])])
    expect(join).toEqual({ incidentId: 'inc_1', label: 'TOHOR-3 · Desa Tohor · #3', others: 2 })
  })

  it('says 0 other reports when the report is alone, which is a new incident', () => {
    expect(findJoin(sent, [detail([obs()])])?.others).toBe(0)
  })

  it('does not take someone else’s report, a different note or an old report for this one', () => {
    expect(findJoin(sent, [detail([obs({ volunteerId: 'vol_2' })])])).toBeNull()
    expect(findJoin(sent, [detail([obs({ text: 'Something else' })])])).toBeNull()
    expect(findJoin(sent, [detail([obs({ chip: 'asap' })])])).toBeNull()
    expect(findJoin(sent, [detail([obs({ receivedAt: new Date(2026, 9, 17, 9, 0).toISOString() })])])).toBeNull()
  })

  it('picks the incident that holds the newest matching report, and finds nothing in no incidents', () => {
    const older = detail([obs({ receivedAt: new Date(2026, 9, 17, 14, 12, 2).toISOString() })], { id: 'inc_a' })
    const newer = detail([obs()], { id: 'inc_b' })
    expect(findJoin(sent, [older, newer])?.incidentId).toBe('inc_b')
    expect(findJoin(sent, [])).toBeNull()
  })
})

describe('the sent card', () => {
  const card = (props: Partial<Parameters<typeof SentCard>[0]> = {}, lang: 'id' | 'en' = 'en') =>
    renderToStaticMarkup(<SentCard lang={lang} kind="sent" at={at} chip="api" text="Small flame by the canal" onNew={() => undefined} {...props} />)

  it('shows the joined incident and the API’s count, with no radius or distance', () => {
    const html = card({ incident: { label: 'TOHOR-3', others: 2 } })
    expect(html).toContain('14:12 · ')
    expect(html).toContain('TOHOR-3')
    expect(html).toContain('Your report joined TOHOR-3. 2 other reports in this incident.')
    expect(html).not.toMatch(/\d+ ?m\b|150|within/)
  })

  it('says it started the incident when nothing else is in it', () => {
    const html = card({ incident: { label: 'TOHOR-6', others: 0 } })
    expect(html).toContain('You started TOHOR-6')
    expect(html).toContain('opened a new one')
    expect(html).not.toContain('Your report joined')
  })

  it('hides the join line while the incident is not known', () => {
    expect(card()).not.toContain('sent-join')
  })

  it('has Done only when the screen can go Home, and speaks Bahasa first', () => {
    expect(card()).not.toContain('data-testid="sent-done"')
    expect(card({ onDone: () => undefined })).toContain('data-testid="sent-done"')
    expect(card({ onDone: () => undefined, incident: { label: 'TOHOR-6', others: 0 } }, 'id')).toContain('Anda membuka TOHOR-6')
  })
})

describe('sent today', () => {
  it('lists the reports newest first with time, status and accuracy, and no invented incident', () => {
    const html = renderToStaticMarkup(
      <SentToday lang="en" entries={[entry({ at: new Date(2026, 9, 17, 13, 40).toISOString(), chip: 'asap', text: 'Thin smoke', accuracyM: 18 }), entry({ incidentLabel: 'TOHOR-3' })]} />,
    )
    expect(html.indexOf('14:12')).toBeLessThan(html.indexOf('13:40'))
    expect(html).toContain('2 REPORTS')
    expect(html).toContain('FIRE · TOHOR-3 · ±18 M')
    expect(html).toContain('SMOKE · ±18 M')
    expect(html).toContain('✓ Sent')
    expect(html).toContain('Only reports from this phone.')
  })

  it('shows nothing before a first report, and Waiting for a queued one', () => {
    expect(renderToStaticMarkup(<SentToday lang="en" entries={[]} />)).toBe('')
    expect(renderToStaticMarkup(<SentToday lang="en" entries={[entry({ kind: 'queued' })]} />)).toContain('Waiting')
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
    const updated = updateSent('vol_1', at, { incidentLabel: 'TOHOR-3', startedIncident: false, otherReports: 2 }, now, store)
    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({ incidentLabel: 'TOHOR-3', otherReports: 2 })
  })

  it('forgets quietly when storage is missing or holds junk', () => {
    expect(loadSentToday('vol_1', now, null)).toEqual([])
    const store = new MemStore()
    store.setItem('ember.report.sentToday', 'nope')
    expect(loadSentToday('vol_1', now, store)).toEqual([])
    expect(addSent('vol_1', entry(), now, null)).toHaveLength(1)
  })
})

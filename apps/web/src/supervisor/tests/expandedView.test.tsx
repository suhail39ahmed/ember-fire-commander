import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { IncidentDetail, Observation } from '../contracts'
import { fixture } from '../fixtures'
import type { IncidentActions } from '../IncidentView'
import { AskThread, ExpandedVolunteerView, ProposalCard, type ChatEntry } from '../detail/ExpandedVolunteerView'
import { IncidentDetailView } from '../detail/IncidentDetailView'
import { expandedCopy } from '../detail/expandedCopy'
import type { AssistActions } from '../detail/assistModel'

const NOW = Date.parse('2026-10-17T03:10:00Z')

const wiring = {
  offline: false,
  now: NOW,
  sendInstruction: async (): Promise<never> => { throw new Error('not used in a static render') },
  photoUrl: async (): Promise<never> => { throw new Error('not used in a static render') },
}

const assist: AssistActions = {
  suggest: async () => ({ items: [], source: null, generatedAt: null }),
  ask: async () => ({ answer: 'Check the ditch edge — smoke visible in latest report.', enoughData: true, at: '2026-10-17T03:10:00Z' }),
  translate: async () => ({ english: 'x', sourceLanguage: 'id', at: null }),
}

function expanded(detail: IncidentDetail, id: string, lang: 'id' | 'en' = 'en', withAssist = false) {
  return renderToStaticMarkup(
    <ExpandedVolunteerView lang={lang} detail={detail} volunteerId={id} onClose={() => undefined} {...wiring} assist={withAssist ? assist : undefined} />,
  )
}

function withPhoto(detail: IncidentDetail): IncidentDetail {
  const photo: Observation = {
    id: 'obs_photo', volunteerId: 'uid_sari', capturedAt: '2026-10-17T03:07:00Z', receivedAt: '2026-10-17T03:07:03Z', source: 'photo',
    lat: -1.85, lng: 110.06, accuracyM: 9, chip: null, text: 'Foto parit', severity: 'smoke', photoPath: 'photos/uid_sari/obs_photo.jpg', immutable: true,
  }
  return { ...detail, observations: [...detail.observations, photo] }
}

function withTranslation(detail: IncidentDetail): IncidentDetail {
  const sari = detail.observations.find((o) => o.volunteerId === 'uid_sari')!
  return { ...detail, translations: { [sari.id]: { english: 'I only see smoke, no fire.', sourceLanguage: 'id', at: null } } }
}

function withWeather(detail: IncidentDetail): IncidentDetail {
  return {
    ...detail,
    conditions: {
      weather: { observedAt: null, windKmh: 12, windDirDeg: 45, windFrom: 'NE', gustKmh: null, tempC: null, humidityPct: null, rainMm: null, source: null },
      air: null,
    },
  }
}

describe('expanded view: layout and structure', () => {
  it('renders a dialog with two panes', () => {
    const html = expanded(fixture('conflict'), 'uid_sari')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Field view"')
    expect(html).toContain(`aria-label="${expandedCopy.chatTitle.en}"`)
  })

  it('shows the volunteer name in the header', () => {
    const html = expanded(fixture('conflict'), 'uid_sari')
    expect(html).toContain('Sari')
  })

  it('shows a close button', () => {
    const html = expanded(fixture('conflict'), 'uid_sari')
    expect(html).toContain(expandedCopy.closeShort.en)
  })

  it('alerts when the volunteer is no longer on the incident', () => {
    const html = expanded(fixture('conflict'), 'uid_ghost')
    expect(html).toContain('no longer on this incident')
    expect(html).toContain('role="alert"')
  })
})

describe('expanded view: left pane — field regions', () => {
  it('shows every left-pane region', () => {
    const regions = [
      expandedCopy.leftTitle.en,
      expandedCopy.windChip.en,
      expandedCopy.latestMsg.en,
      expandedCopy.snapshots.en,
    ]
    const html = expanded(fixture('conflict'), 'uid_sari')
    for (const region of regions) {
      expect(html, region).toContain(`aria-label="${region}"`)
    }
    expect(html).toContain(`aria-label="${expandedCopy.sentTitle.en} Sari"`)
  })

  it('shows live video placeholder and all disabled controls', () => {
    const html = expanded(fixture('conflict'), 'uid_sari')
    expect(html).toContain(expandedCopy.videoPlaceholder.en)
    for (const label of [expandedCopy.mic.en, expandedCopy.video.en, expandedCopy.snapshot.en, expandedCopy.flip.en, expandedCopy.endLive.en]) {
      expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${label}</button>`))
    }
  })

  it('shows "not available yet" for video — never invents a live feed', () => {
    const html = expanded(fixture('conflict'), 'uid_sari')
    expect(html).toContain(expandedCopy.notYet.en.toUpperCase())
    expect(html).toContain(expandedCopy.videoPlaceholder.en)
  })

  it('shows the frame caption placeholder', () => {
    const html = expanded(fixture('conflict'), 'uid_sari')
    expect(html).toContain(expandedCopy.captionPlaceholder.en)
  })

  it('shows the latest volunteer report in the left pane', () => {
    const html = expanded(fixture('conflict'), 'uid_sari')
    expect(html).toContain('Saya lihat asap saja, tidak ada api')
  })

  it('shows the English translation under the report when stored', () => {
    const html = expanded(withTranslation(fixture('conflict')), 'uid_sari')
    expect(html).toContain('Saya lihat asap saja, tidak ada api')
    expect(html).toContain('I only see smoke, no fire.')
    expect(html).toContain('exp-msg-en')
  })

  it('does not show a translation if the report is already English', () => {
    const d = fixture('conflict')
    const sari = d.observations.find((o) => o.volunteerId === 'uid_sari')!
    const dWithEn = { ...d, translations: { [sari.id]: { english: 'Same text', sourceLanguage: 'en', at: null } } }
    expect(expanded(dWithEn, 'uid_sari')).not.toContain('exp-msg-en')
  })

  it('says no reports yet when the volunteer has none', () => {
    const d = fixture('conflict')
    d.observations = d.observations.filter((o) => o.volunteerId !== 'uid_sari')
    d.tasks = d.tasks.filter((t) => t.volunteerId === 'uid_sari')
    const html = expanded(d, 'uid_sari')
    expect(html).toContain(expandedCopy.noMsg.en)
  })

  it('shows saved snapshots when present', () => {
    const html = expanded(withPhoto(fixture('conflict')), 'uid_sari')
    expect(html).not.toContain(expandedCopy.noSnapshots.en)
    expect(html).toContain('Loading photo')
  })

  it('says no snapshots when none are stored', () => {
    const html = expanded(fixture('conflict'), 'uid_sari')
    expect(html).toContain(expandedCopy.noSnapshots.en)
  })

  it('lists sent instructions on one line each with a status', () => {
    const d = fixture('conflict')
    const mine = d.tasks.find((task) => task.volunteerId === 'uid_sari')!
    const html = expanded({ ...d, tasks: d.tasks.map((task) => (task.id === mine.id ? { ...task, sentAt: '2026-10-17T03:05:00Z', heardAt: '2026-10-17T03:06:00Z' } : task)) }, 'uid_sari')
    expect(html).toContain('exp-sent-line')
    expect(html).toContain(mine.instruction as string)
    expect(html).toContain(`${expandedCopy.heard.en} ✓`)
  })

  it('says no instructions when none are stored', () => {
    const d = fixture('normal')
    expect(expanded({ ...d, tasks: [] }, 'uid_dedi')).toContain(expandedCopy.noSent.en)
  })

  it('shows wind when stored in conditions', () => {
    const html = expanded(withWeather(fixture('conflict')), 'uid_sari')
    expect(html).toContain('NE')
    expect(html).toContain('12 km/h')
    expect(html).not.toContain(expandedCopy.windNotYet.en)
  })

  it('says wind is not available yet when conditions are absent', () => {
    const html = expanded(fixture('conflict'), 'uid_sari')
    expect(html).toContain(expandedCopy.windNotYet.en)
  })
})

describe('expanded view: AI labels', () => {
  it('names the model on every place its output shows', () => {
    const detail = { ...withPhoto(fixture('conflict')), photoReads: { obs_photo: { smokeVisible: true, flameVisible: 'small', burnScarVisible: false, notes: null, at: null } } }
    const html = expanded(detail, 'uid_sari', 'en', true)
    expect(html).toContain('AI read the frame · check it yourself')
    expect(html).toContain('AI photo check')
    expect(expanded(withTranslation(fixture('conflict')), 'uid_sari')).toContain('AI translation')
    expect(html).toContain('Ask EMBER AI about Sari')
    expect(html).toContain('Asks before it sends')
    expect(renderToStaticMarkup(<ProposalCard lang="en" name="Sari" draft="x" offline={false} onSendOnly={async () => undefined} />)).toContain('AI draft')
  })

  it('labels a model reply with an AI chip and the supervisor question with none', () => {
    expect(expandedCopy.ember.en).toBe('AI')
    expect(expandedCopy.you.en).toBe('You')
  })
})

describe('expanded view: snapshots are a row of small thumbnails', () => {
  it('lays the saved snapshots out four across, each with a time and the volunteer name under it', () => {
    const d = withPhoto(fixture('conflict'))
    const html = expanded(d, 'uid_sari')
    expect(html).toContain('class="exp-snaps"')
    expect(html).toContain('class="exp-snap-thumb"')
    expect(html).not.toContain('pop-snap-img')
    expect(html).toMatch(/<span class="exp-snap-cap">[^<]*· Sari<\/span>/)
    const css = readFileSync(resolve(__dirname, '../detail/expanded.css'), 'utf8')
    expect(css).toMatch(/\.exp-snaps \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
    expect(css).toMatch(/\.exp-snap \.exp-snap-thumb \{[^}]*aspect-ratio: 16 \/ 9[^}]*object-fit: cover/)
  })
})

describe('expanded view: right pane — Ask EMBER', () => {
  it('shows the chat thread region', () => {
    const html = expanded(fixture('conflict'), 'uid_sari')
    expect(html).toContain(`aria-label="${expandedCopy.chatTitle.en}"`)
  })

  it('shows the three quick prompts', () => {
    const html = expanded(fixture('conflict'), 'uid_sari', 'en', true)
    expect(html).toContain(expandedCopy.promptNext.en)
    expect(html).toContain(expandedCopy.promptRecap.en)
    expect(html).toContain(expandedCopy.promptAll.en)
  })

  it('shows the Ask input when assist is provided', () => {
    const html = expanded(fixture('conflict'), 'uid_sari', 'en', true)
    expect(html).toMatch(/<input[^>]*aria-label="Ask EMBER AI about this volunteer…"/)
  })

  it('shows one hint line, not a card, while there is no draft', () => {
    const html = expanded(fixture('conflict'), 'uid_sari', 'en', true)
    expect(html).toContain(expandedCopy.proposalEmpty.en)
    expect(html).toContain('exp-proposal-hint')
    expect(html).not.toContain('class="exp-proposal"')
    expect(html).not.toContain(expandedCopy.proposalTitle.en)
    expect(html).not.toContain(expandedCopy.sendBoth.en)
    expect(html).not.toContain(`${expandedCopy.sendOnly.en} Sari`)
  })

  it('shows the draft card with both choices once a draft exists', () => {
    const html = renderToStaticMarkup(<ProposalCard lang="en" name="Sari" draft="Hold the north side." offline={false} onSendOnly={async () => undefined} />)
    expect(html).toContain('class="exp-proposal"')
    expect(html).toContain('AI draft')
    expect(html).toContain(expandedCopy.proposalTitle.en)
    expect(html).toContain('Hold the north side.')
    expect(html).toContain(expandedCopy.sendBoth.en)
    expect(html).toContain(`${expandedCopy.sendOnly.en} Sari`)
    expect(html).not.toContain('exp-proposal-hint')
  })

  it('"Send both now" is always disabled — no route yet for first pickup', () => {
    const html = renderToStaticMarkup(<ProposalCard lang="en" name="Sari" draft="Hold the north side." offline={false} onSendOnly={async () => undefined} />)
    const match = html.match(new RegExp(`<button[^>]*>${expandedCopy.sendBoth.en}</button>`))
    expect(match?.[0]).toMatch(/disabled=""/)
  })

  it('"Only to Sari" is enabled with a draft and disabled offline', () => {
    const live = renderToStaticMarkup(<ProposalCard lang="en" name="Sari" draft="Hold the north side." offline={false} onSendOnly={async () => undefined} />)
    expect(live.match(new RegExp(`<button[^>]*>${expandedCopy.sendOnly.en} Sari</button>`))?.[0]).not.toMatch(/disabled=""/)
    const off = renderToStaticMarkup(<ProposalCard lang="en" name="Sari" draft="Hold the north side." offline onSendOnly={async () => undefined} />)
    expect(off.match(new RegExp(`<button[^>]*>${expandedCopy.sendOnly.en} Sari</button>`))?.[0]).toMatch(/disabled=""/)
  })

  it('states WITHDRAW is never held up by this chat, once', () => {
    const html = expanded(fixture('conflict'), 'uid_sari')
    expect(html.split(expandedCopy.withdrawRule.en).length - 1).toBe(1)
  })

  it('does not repeat the WITHDRAW line when a draft card is showing', () => {
    const card = renderToStaticMarkup(<ProposalCard lang="en" name="Sari" draft="Hold the north side." offline={false} onSendOnly={async () => undefined} />)
    expect(card).not.toContain('WITHDRAW')
  })

  describe('Ask thread layout', () => {
    const entry = (id: number): ChatEntry => ({ id, question: `Question ${id}`, answer: { answer: `Answer ${id}`, enoughData: true, at: '2026-10-17T03:10:00Z' } })
    const css = readFileSync(resolve(__dirname, '../detail/expanded.css'), 'utf8')

    it('renders no empty box while there are no messages, only a hint line', () => {
      const html = renderToStaticMarkup(<AskThread lang="en" entries={[]} />)
      expect(html).toContain(expandedCopy.chatNote.en)
      expect(html).not.toContain('class="exp-thread"')
    })

    it('renders the thread column once there are messages', () => {
      const html = renderToStaticMarkup(<AskThread lang="en" entries={[entry(0), entry(1), entry(2)]} />)
      expect(html).toContain('class="exp-thread"')
      expect(html).toContain('Question 2')
      expect(html).toContain('Answer 2')
      expect(html).toContain('2 earlier messages')
      expect(html).not.toContain(expandedCopy.chatNote.en)
    })

    it('sizes the thread by its content and scrolls it when it overflows', () => {
      const rule = css.match(/\.exp-thread \{[^}]*\}/)?.[0] ?? ''
      expect(rule).toMatch(/flex:\s*1 1 auto/)
      expect(rule).toMatch(/min-height:\s*0/)
      expect(rule).toMatch(/overflow-y:\s*auto/)
      expect(rule).toMatch(/border:\s*1px solid/)
      expect(rule).toMatch(/border-radius:\s*12px/)
      const zone = css.match(/\.exp-thread-zone \{[^}]*\}/)?.[0] ?? ''
      expect(zone).toMatch(/flex:\s*0 1 auto/)
      expect(zone).toMatch(/max-height:\s*42vh/)
    })
  })

  it('marks the WITHDRAW-sent volunteer and says the rule applies', () => {
    const html = expanded(fixture('withdraw'), 'uid_dedi')
    expect(html).toContain(expandedCopy.withdrawRule.en)
  })

  it('quick prompts are disabled offline', () => {
    const html = renderToStaticMarkup(
      <ExpandedVolunteerView lang="en" detail={fixture('conflict')} volunteerId="uid_sari" onClose={() => undefined} offline now={NOW} sendInstruction={async () => { throw new Error('') }} photoUrl={async () => { throw new Error('') }} assist={assist} />,
    )
    // quick prompts are rendered as disabled buttons (the prompt text may contain regex special chars so we check the class+disabled combo)
    expect(html).toContain('class="exp-prompt-btn" disabled=""')
    expect(html).toContain(expandedCopy.promptNext.en)
    expect(html).toContain(expandedCopy.promptRecap.en)
  })
})

describe('expanded view: language', () => {
  it('speaks Bahasa throughout when lang is "id"', () => {
    const html = expanded(fixture('conflict'), 'uid_sari', 'id')
    expect(html).toContain(expandedCopy.videoPlaceholder.id)
    expect(html).toContain(expandedCopy.closeShort.id)
    expect(html).toContain(expandedCopy.latestMsg.id)
    expect(html).toContain(expandedCopy.windNotYet.id)
    expect(html).toContain(expandedCopy.withdrawRule.id)
  })

  it('has both id and en for every copy key', () => {
    for (const [key, value] of Object.entries(expandedCopy)) {
      expect(value.en, key).toBeTruthy()
      expect(value.id, key).toBeTruthy()
    }
  })
})

describe('expanded view: where it opens in the incident detail', () => {
  it('does not render the expanded view when no card is expanded', () => {
    const noop = { busyId: null, outcomes: {}, onApprove: () => undefined, onReject: () => undefined, onVerify: () => undefined } as unknown as IncidentActions
    const d = fixture('conflict')
    const html = renderToStaticMarkup(
      <StaticRouter location="/console/incidents/inc_demo_01">
        <IncidentDetailView
          lang="en" incidentId="inc_demo_01" detail={d} queue={[d.incident]} failure={null} link="online" lastOkAt={NOW} now={NOW} actions={noop}
          onRetry={() => undefined} onSelect={() => undefined} sendWithdraw={async () => ({ incident: d.incident, auditId: 'a' })} actorName="Bu Maya"
          serverNow={() => NOW} lowerSeverity={async () => ({ incident: d.incident, auditId: 'a' })} extinguish={async () => ({ incident: d.incident, auditId: 'a' })}
          markSafe={async () => ({ incident: d.incident, auditId: 'a' })} resendTask={async () => ({ auditId: 'a' })}
          sendInstruction={async () => ({ task: d.tasks[0], auditId: 'a' })} photoUrl={async () => ({ url: 'https://photo.example/x.jpg', expiresAt: '2026-10-17T03:15:00Z' })}
        />
      </StaticRouter>,
    )
    expect(html).not.toContain('role="dialog"')
    expect(html.match(/aria-label="Expand (Sari|Dedi)"/g)).toHaveLength(2)
  })
})

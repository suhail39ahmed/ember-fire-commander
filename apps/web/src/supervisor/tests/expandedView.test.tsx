import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { IncidentDetail, Observation } from '../contracts'
import { fixture } from '../fixtures'
import type { IncidentActions } from '../IncidentView'
import { ExpandedVolunteerView } from '../detail/ExpandedVolunteerView'
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

  it('lists sent instructions with heard/done status', () => {
    const html = expanded(fixture('conflict'), 'uid_sari')
    expect(html).toContain('Verify')
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
    expect(html).toMatch(/<input[^>]*aria-label="Ask EMBER about this volunteer…"/)
  })

  it('shows the proposal card with placeholder when no answer yet', () => {
    const html = expanded(fixture('conflict'), 'uid_sari', 'en', true)
    expect(html).toContain(expandedCopy.proposalTitle.en)
    expect(html).toContain(expandedCopy.proposalEmpty.en)
  })

  it('has "Send both now" and "Only to Sari" buttons', () => {
    const html = expanded(fixture('conflict'), 'uid_sari', 'en', true)
    expect(html).toContain(expandedCopy.sendBoth.en)
    expect(html).toContain(`${expandedCopy.sendOnly.en} Sari`)
  })

  it('"Send both now" is always disabled — no route yet for first pickup', () => {
    const html = expanded(fixture('conflict'), 'uid_sari', 'en', true)
    const match = html.match(new RegExp(`<button[^>]*>${expandedCopy.sendBoth.en}</button>`))
    expect(match?.[0]).toMatch(/disabled=""/)
  })

  it('"Only to Sari" is disabled when there is no draft yet', () => {
    const html = expanded(fixture('conflict'), 'uid_sari', 'en', true)
    const match = html.match(new RegExp(`<button[^>]*>${expandedCopy.sendOnly.en} Sari</button>`))
    expect(match?.[0]).toMatch(/disabled=""/)
  })

  it('states WITHDRAW is never held up by this chat', () => {
    const html = expanded(fixture('conflict'), 'uid_sari')
    expect(html).toContain(expandedCopy.withdrawRule.en)
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

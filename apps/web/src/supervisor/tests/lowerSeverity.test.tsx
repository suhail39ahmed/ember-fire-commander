import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../pwa/api/types'
import { createHttpSupervisorApi } from '../api/client'
import { createMockSupervisorApi } from '../api/mock'
import type { Incident, Severity } from '../contracts'
import { ActionBar } from '../detail/ActionBar'
import { LowerSeverityDialog } from '../detail/LowerSeverityDialog'
import { defaultChoice, failureMessage, isAllowed, lowerChoices, loweredText, submitLower } from '../detail/severityModel'
import { fixture } from '../fixtures'

const incidentAt = (severity: Severity, withdraw = false): Incident => {
  const base = fixture(withdraw ? 'withdraw' : 'normal').incident
  return { ...base, severity }
}
const decision = { incident: incidentAt('smoke'), auditId: 'aud_4' }

function dialog(over: Partial<Parameters<typeof LowerSeverityDialog>[0]> = {}, lang: 'id' | 'en' = 'en') {
  return renderToStaticMarkup(
    <LowerSeverityDialog
      lang={lang}
      incident={incidentAt('small_flame')}
      offline={false}
      send={async () => decision}
      onLowered={() => undefined}
      onClose={() => undefined}
      {...over}
    />,
  )
}

describe('lower severity: the choices', () => {
  it('offers only strictly lower values, nearest first', () => {
    expect(lowerChoices('large_flame')).toEqual(['small_flame', 'smoke', 'none'])
    expect(lowerChoices('small_flame')).toEqual(['smoke', 'none'])
    expect(lowerChoices('smoke')).toEqual(['none'])
  })

  it('offers nothing below none, and nothing at all for unknown', () => {
    expect(lowerChoices('none')).toEqual([])
    expect(lowerChoices('unknown')).toEqual([])
    expect(defaultChoice('none')).toBeNull()
  })

  it('never offers the current value, a higher value or unknown', () => {
    for (const current of ['none', 'smoke', 'small_flame', 'large_flame', 'unknown'] as Severity[]) {
      const choices: Severity[] = lowerChoices(current)
      expect(choices).not.toContain(current)
      expect(choices).not.toContain('unknown')
      expect(choices).not.toContain('large_flame')
      expect(isAllowed(current, 'unknown')).toBe(false)
      expect(isAllowed(current, current)).toBe(false)
    }
    expect(isAllowed('smoke', 'small_flame')).toBe(false)
    expect(isAllowed('small_flame', 'smoke')).toBe(true)
  })

  it('selects the nearest lower value first', () => {
    expect(defaultChoice('small_flame')).toBe('smoke')
  })
})

describe('lower severity: dialog', () => {
  it('matches the frame for a small flame: current, Smoke selected, None, notes, Cancel, named button', () => {
    const html = dialog()
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Lower severity for Ketapang, Kalimantan Barat · Pak Dedi · #1')
    expect(html).toContain('CURRENT · Small flame')
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    expect(html).toMatch(/<input type="radio" name="lower-severity" checked="" value="smoke"/)
    expect(html).not.toMatch(/value="none" checked=""/)
    expect(html).toContain('Smoke — no visible flame')
    expect(html).toContain('None — nothing burning')
    expect(html).not.toContain('value="large_flame"')
    expect(html).not.toContain('value="unknown"')
    expect(html).toContain('Large flame isn’t offered: only code can raise severity.')
    expect(html).toContain('Unknown isn’t offered: it never lowers a known severity.')
    expect(html).toContain('>Cancel</button>')
    expect(html).toContain('>Lower to smoke</button>')
  })

  it('lists three values from a large flame and drops the large-flame sentence', () => {
    const html = dialog({ incident: incidentAt('large_flame') })
    expect(html.match(/type="radio"/g)).toHaveLength(3)
    expect(html).toContain('Only code can raise severity.')
    expect(html).not.toContain('Large flame isn’t offered')
  })

  it('says an active withdraw stays in effect', () => {
    expect(dialog({ incident: incidentAt('small_flame', true) })).toContain('An active WITHDRAW stays in effect.')
    expect(dialog()).not.toContain('An active WITHDRAW')
  })

  it('has no choices and a disabled button when nothing is lower', () => {
    const html = dialog({ incident: incidentAt('none') })
    expect(html).toContain('Nothing is lower than this.')
    expect(html).not.toContain('type="radio"')
    expect(html).toMatch(/disabled="">Choose the new severity\./)
  })

  it('speaks Bahasa', () => {
    const html = dialog({}, 'id')
    expect(html).toContain('Turunkan tingkat untuk')
    expect(html).toContain('SAAT INI · Api kecil')
    expect(html).toContain('Asap — tidak ada api terlihat')
    expect(html).toContain('>Turunkan ke asap</button>')
    expect(html).toContain('>Batal</button>')
  })

  it('blocks saving while offline', () => {
    expect(dialog({ offline: true })).toMatch(/inc-btn-ink" disabled="">Offline · can’t send/)
  })

  it('does not write just by being drawn', () => {
    const send = vi.fn(async () => decision)
    dialog({ send })
    expect(send).not.toHaveBeenCalled()
  })
})

describe('lower severity: submit and refusals', () => {
  it('sends the chosen lower value and returns the audit id', async () => {
    const send = vi.fn(async () => decision)
    await expect(submitLower(send, 'small_flame', 'smoke', 'en')).resolves.toEqual({ ok: true, auditId: 'aud_4', severity: 'smoke' })
    expect(send).toHaveBeenCalledWith('smoke')
  })

  it('never sends the current value, a higher value, unknown, or nothing', async () => {
    const send = vi.fn(async () => decision)
    for (const chosen of ['small_flame', 'large_flame', 'unknown', null] as (Severity | null)[]) {
      const result = await submitLower(send, 'small_flame', chosen, 'en')
      expect(result.ok).toBe(false)
    }
    expect(send).not.toHaveBeenCalled()
  })

  it('explains a rejected change inline, without a status code or server text', async () => {
    const send = async () => {
      throw new ApiError('conflict', 'Severity can only be lowered', 409, false)
    }
    const result = await submitLower(send, 'small_flame', 'smoke', 'en')
    expect(result).toEqual({ ok: false, message: expect.stringContaining('severity has changed') })
    expect(JSON.stringify(result)).not.toMatch(/409|conflict|only be lowered/)
  })

  it('gives each failure its own message in ID and EN, with no codes or exception names', () => {
    const cases: [unknown, RegExp][] = [
      [new ApiError('network', 'Network error', null, true), /Could not reach ember-api\. The severity was not changed/],
      [new ApiError('conflict', 'x', 409, false), /severity has changed/],
      [new ApiError('validation_error', 'severity is not valid', 400, false, { severity: 'use none' }), /was not accepted/],
      [new ApiError('forbidden', 'Supervisor role required', 403, false), /Sign in again as a supervisor/],
      [new ApiError('not_found', 'id is unknown', 404, false), /no longer exists/],
      [new ApiError('unavailable', 'HTTP 503', 503, true), /nothing was confirmed/],
      [new Error('TypeError: boom'), /nothing was confirmed/],
    ]
    for (const [error, pattern] of cases) {
      const en = failureMessage(error, 'en')
      expect(en).toMatch(pattern)
      expect(en).not.toMatch(/\b(40[0-9]|50[0-9])\b|TypeError|HTTP|Supervisor role required|id is unknown/)
      expect(failureMessage(error, 'id')).not.toBe(en)
    }
  })

  it('confirms who lowered it, to what, with the audit id, and that withdraw stays', () => {
    expect(loweredText('en', 'Smoke', 'Bu Maya', 'aud_4', true)).toBe('Severity lowered to Smoke by Bu Maya · audit aud_4. An active WITHDRAW stays in effect.')
    expect(loweredText('en', 'Smoke', '', 'aud_4', false)).toBe('Severity lowered to Smoke · audit aud_4.')
    expect(loweredText('id', 'Asap', 'Bu Maya', 'aud_4', false)).toBe('Tingkat diturunkan ke Asap oleh Bu Maya · audit aud_4.')
  })
})

describe('lower severity: the action on the incident', () => {
  const bar = (incident: Incident, over: Partial<Parameters<typeof ActionBar>[0]> = {}) =>
    renderToStaticMarkup(
      <StaticRouter location="/console/incidents/inc_demo_01">
        <ActionBar lang="en" incident={incident} offline={false} busy={false} onVerify={() => undefined} onSendWithdraw={() => undefined} onLowerSeverity={() => undefined} onExtinguish={() => undefined} {...over} />
      </StaticRouter>,
    )

  it('offers Lower severity when something is lower, and disables it otherwise', () => {
    expect(bar(incidentAt('small_flame'))).toMatch(/<button type="button" class="inc-btn">Lower severity<\/button>/)
    expect(bar(incidentAt('none'))).toMatch(/class="inc-btn" disabled="">Lower severity/)
    expect(bar(incidentAt('unknown'))).toMatch(/class="inc-btn" disabled="">Lower severity/)
    expect(bar(incidentAt('small_flame'), { offline: true })).toMatch(/class="inc-btn" disabled="">Lower severity/)
  })

  it('does not offer it on an extinguished incident', () => {
    expect(bar({ ...incidentAt('small_flame'), status: 'extinguished' })).not.toContain('Lower severity')
  })
})

describe('lower severity: the route', () => {
  const headers = async () => ({ Authorization: 'Bearer t', 'X-Firebase-AppCheck': 'a' })

  it('posts the chosen severity to the existing severity route', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(decision), { status: 200 }))
    const api = createHttpSupervisorApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await expect(api.lowerSeverity('inc_1', 'smoke')).resolves.toEqual(decision)
    const [url, init] = (fetchImpl.mock.calls as unknown as [string, RequestInit][])[0]
    expect(url).toBe('https://api.example/incidents/inc_1/severity')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ severity: 'smoke' })
  })

  it('lowers a small flame to smoke, records the audit and leaves an active withdraw in place', async () => {
    const api = createMockSupervisorApi('sup_1', 'withdraw', 0)
    const before = await api.getIncident('inc_demo_01')
    const result = await api.lowerSeverity('inc_demo_01', 'smoke')
    expect(result.incident.severity).toBe('smoke')
    expect(result.incident.withdraw).toEqual(before.incident.withdraw)
    expect(result.incident.withdraw?.active).toBe(true)
    expect(api.mock.audit.map((a) => a.action)).toEqual(['incident.severity.lower'])
  })

  it('refuses the current value, a higher value and unknown, and the incident is unchanged', async () => {
    const api = createMockSupervisorApi('sup_1', 'normal', 0)
    const before = await api.getIncident('inc_demo_01')
    await expect(api.lowerSeverity('inc_demo_01', 'small_flame')).rejects.toMatchObject({ status: 409 })
    await expect(api.lowerSeverity('inc_demo_01', 'large_flame')).rejects.toMatchObject({ status: 409 })
    await expect(api.lowerSeverity('inc_demo_01', 'unknown' as never)).rejects.toMatchObject({ status: 400 })
    expect(await api.getIncident('inc_demo_01')).toEqual(before)
    expect(api.mock.audit).toHaveLength(0)
  })
})

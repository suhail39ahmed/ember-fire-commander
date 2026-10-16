import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../pwa/api/types'
import { formatTimeZone } from '../../pwa/formatTime'
import { createHttpSupervisorApi } from '../api/client'
import { createMockSupervisorApi } from '../api/mock'
import type { Incident } from '../contracts'
import { ActionBar } from '../detail/ActionBar'
import { ExtinguishDialog } from '../detail/ExtinguishDialog'
import { doneText, failureMessage, isAlreadyOut, submitExtinguish } from '../detail/extinguishModel'
import { fixture } from '../fixtures'

const incident = fixture('normal').incident
const decision = { incident: { ...incident, status: 'extinguished' as const }, auditId: 'aud_7' }

function dialog(over: Partial<Parameters<typeof ExtinguishDialog>[0]> = {}, lang: 'id' | 'en' = 'en') {
  return renderToStaticMarkup(
    <ExtinguishDialog
      lang={lang}
      incident={incident}
      actorName="Bu Maya"
      offline={false}
      send={async () => decision}
      onDone={() => undefined}
      onAlreadyOut={() => undefined}
      onClose={() => undefined}
      {...over}
    />,
  )
}

describe('mark extinguished: dialog', () => {
  it('matches the frame: the incident name, who may do it, who is logged, the watch note, Cancel, confirm', () => {
    const html = dialog()
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Mark Ketapang, Kalimantan Barat · Pak Dedi · #1 extinguished?')
    expect(html).toContain('Only a supervisor can do this, and it can’t be undone from the console.')
    expect(html).toContain('It is logged as incident.extinguish by Bu Maya at the time you confirm.')
    expect(html).toContain('Peat can re-ignite underground')
    expect(html).toContain('The site stays on re-ignition watch. New reports near it raise a re-check alert.')
    expect(html).toContain('This incident is not reopened.')
    expect(html).toContain('>Cancel</button>')
    expect(html).toContain('>Mark extinguished</button>')
    expect(html).not.toContain('disabled')
  })

  it('speaks Bahasa', () => {
    const html = dialog({}, 'id')
    expect(html).toContain('Tandai Ketapang, Kalimantan Barat · Pak Dedi · #1 padam?')
    expect(html).toContain('Hanya supervisor yang bisa melakukan ini')
    expect(html).toContain('Gambut bisa menyala lagi di bawah tanah')
    expect(html).toContain('>Batal</button>')
    expect(html).toContain('>Tandai padam</button>')
  })

  it('names the readable incident, never a raw id', () => {
    const html = dialog({ incident: { ...incident, id: '4kQ9xZ7hLm', name: null } })
    expect(html).toContain('Mark Incident · Ketapang, Kalimantan Barat extinguished?')
    expect(html).not.toContain('4kQ9xZ7hLm')
  })

  it('blocks confirming while offline', () => {
    expect(dialog({ offline: true })).toMatch(/inc-btn-ink" disabled="">Offline · can’t send/)
  })

  it('does not write just by being drawn', () => {
    const send = vi.fn(async () => decision)
    dialog({ send })
    expect(send).not.toHaveBeenCalled()
  })
})

describe('mark extinguished: confirm and refusals', () => {
  it('calls the route once and returns the audit id', async () => {
    const send = vi.fn(async () => decision)
    await expect(submitExtinguish(send, 'en')).resolves.toEqual({ ok: true, auditId: 'aud_7' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('shows who did it and when, with the audit id', () => {
    const at = Date.parse('2026-10-17T03:12:00Z')
    expect(doneText('en', 'Bu Maya', at, 'aud_7')).toBe(`Marked extinguished by Bu Maya at ${formatTimeZone(at)} · audit aud_7.`)
    expect(doneText('id', 'Bu Maya', at, 'aud_7')).toBe(`Ditandai padam oleh Bu Maya pukul ${formatTimeZone(at)} · audit aud_7.`)
    expect(doneText('en', '', at, 'aud_7')).toBe(`Marked extinguished at ${formatTimeZone(at)} · audit aud_7.`)
  })

  it('explains a second confirm: it is already out, nothing changed', async () => {
    const send = async () => {
      throw new ApiError('conflict', 'The incident is already extinguished', 409, false)
    }
    const result = await submitExtinguish(send, 'en')
    expect(result).toEqual({ ok: false, alreadyOut: true, message: 'This incident is already marked extinguished. Nothing was changed again.' })
    expect(isAlreadyOut(new ApiError('conflict', 'x', 409, false))).toBe(true)
    expect(isAlreadyOut(new ApiError('x', 'x', 500, true))).toBe(false)
  })

  it('gives each other failure its own message in ID and EN, with no codes or server text', () => {
    const cases: [unknown, RegExp][] = [
      [new ApiError('network', 'Network error', null, true), /Could not reach ember-api\. The incident was not marked extinguished/],
      [new ApiError('forbidden', 'Supervisor role required', 403, false), /Sign in again as a supervisor/],
      [new ApiError('unauthorized', 'bad token', 401, false), /Sign in again as a supervisor/],
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
})

describe('mark extinguished: the action on the incident', () => {
  const bar = (over: Partial<Incident> = {}, props: Partial<Parameters<typeof ActionBar>[0]> = {}) =>
    renderToStaticMarkup(
      <StaticRouter location="/console/incidents/inc_demo_01">
        <ActionBar lang="en" incident={{ ...incident, ...over }} offline={false} busy={false} onVerify={() => undefined} onSendWithdraw={() => undefined} onLowerSeverity={() => undefined} onExtinguish={() => undefined} {...props} />
      </StaticRouter>,
    )

  it('offers Mark extinguished on a live incident, disabled while offline or busy', () => {
    expect(bar()).toMatch(/<button type="button" class="inc-btn">Mark extinguished<\/button>/)
    expect(bar({}, { offline: true })).toMatch(/class="inc-btn" disabled="">Mark extinguished/)
    expect(bar({}, { busy: true })).toMatch(/class="inc-btn" disabled="">Mark extinguished/)
  })

  it('does not offer it on an incident that is already extinguished', () => {
    expect(bar({ status: 'extinguished' })).not.toContain('Mark extinguished')
  })
})

describe('mark extinguished: the route', () => {
  const headers = async () => ({ Authorization: 'Bearer t', 'X-Firebase-AppCheck': 'a' })

  it('posts to the existing extinguish route with no body', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(decision), { status: 200 }))
    const api = createHttpSupervisorApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    await expect(api.extinguishIncident('inc_1')).resolves.toEqual(decision)
    const [url, init] = (fetchImpl.mock.calls as unknown as [string, RequestInit][])[0]
    expect(url).toBe('https://api.example/incidents/inc_1/extinguish')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
  })

  it('extinguishes a verified incident, writes the audit and drops it from the live list', async () => {
    const api = createMockSupervisorApi('sup_1', 'normal', 0)
    await api.verifyIncident('inc_demo_01')
    const result = await api.extinguishIncident('inc_demo_01')
    expect(result.incident.status).toBe('extinguished')
    expect(result.auditId).toMatch(/^aud_/)
    expect(api.mock.audit.map((a) => a.action)).toEqual(['incident.verify', 'incident.extinguish'])
    expect(await api.listIncidents()).toEqual([])
    expect((await api.getIncident('inc_demo_01')).incident.status).toBe('extinguished')
  })

  it('a second confirm is a 409, writes no second audit and changes nothing', async () => {
    const api = createMockSupervisorApi('sup_1', 'normal', 0)
    await api.extinguishIncident('inc_demo_01')
    const before = await api.getIncident('inc_demo_01')
    await expect(api.extinguishIncident('inc_demo_01')).rejects.toMatchObject({ status: 409 })
    expect(await api.getIncident('inc_demo_01')).toEqual(before)
    expect(api.mock.audit.filter((a) => a.action === 'incident.extinguish')).toHaveLength(1)
  })

  it('an unknown incident is a 404', async () => {
    const api = createMockSupervisorApi('sup_1', 'normal', 0)
    await expect(api.extinguishIncident('nope')).rejects.toMatchObject({ status: 404 })
  })
})

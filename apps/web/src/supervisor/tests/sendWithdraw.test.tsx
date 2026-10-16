import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../pwa/api/types'
import { formatTimeZone } from '../../pwa/formatTime'
import { createHttpSupervisorApi } from '../api/client'
import { createMockSupervisorApi } from '../api/mock'
import type { IncidentDetail } from '../contracts'
import { ActionBar } from '../detail/ActionBar'
import { SendWithdrawDialog } from '../detail/SendWithdrawDialog'
import { volunteersOf } from '../detail/model'
import {
  buildRequest, defaultInstruction, failureMessage, formProblem, initialSelection, recipientDetail, sentText, submitWithdraw,
  toggleSelection, WITHDRAW_REASON,
} from '../detail/withdrawModel'
import { fixture } from '../fixtures'

/** Sari and Dedi reported, Rizal only has a task: the frame's three rows. */
function threeVolunteers(): IncidentDetail {
  const detail = fixture('conflict')
  detail.tasks.push({ id: 't_rizal', incidentId: 'inc_demo_01', volunteerId: 'uid_rizal', type: 'investigate', status: 'proposed', instruction: 'Bring the pump' })
  return detail
}

const decision = { incident: fixture('normal').incident, auditId: 'aud_9' }

function dialog(over: Partial<Parameters<typeof SendWithdrawDialog>[0]> = {}, lang: 'id' | 'en' = 'en', detail = threeVolunteers()) {
  return renderToStaticMarkup(
    <SendWithdrawDialog
      lang={lang}
      incident={detail.incident}
      rows={volunteersOf(detail)}
      offline={false}
      send={async () => decision}
      onSent={() => undefined}
      onClose={() => undefined}
      {...over}
    />,
  )
}

describe('send withdraw: recipients and request', () => {
  const rows = volunteersOf(threeVolunteers())

  it('selects the volunteers who reported, not the one with only a task', () => {
    expect(initialSelection(rows).sort()).toEqual(['uid_dedi', 'uid_sari'])
    expect(initialSelection(rows.map((r) => ({ ...r, reportCount: 0, latest: null }))).sort()).toEqual(['uid_dedi', 'uid_rizal', 'uid_sari'])
    expect(toggleSelection(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('describes each row by its reports, or by its task when it has none', () => {
    const byId = (id: string) => rows.find((r) => r.id === id)!
    expect(recipientDetail(byId('uid_sari'), 'en')).toBe(`1 report · ${formatTimeZone('2026-10-17T03:05:00Z')}`)
    expect(recipientDetail(byId('uid_rizal'), 'en')).toBe('Dispatch task · waiting for approval')
    expect(recipientDetail(byId('uid_rizal'), 'id')).toBe('Kirim tim tugas · menunggu persetujuan')
  })

  it('builds the request with the saved reason, a trimmed instruction and ids in list order', () => {
    const request = buildRequest(rows, ['uid_dedi', 'uid_sari'], '  Mundur sekarang  ')
    expect(request).toEqual({
      volunteerIds: rows.filter((r) => r.id === 'uid_sari' || r.id === 'uid_dedi').map((r) => r.id),
      instruction: 'Mundur sekarang',
      reasons: ['supervisor instruction'],
    })
    expect(WITHDRAW_REASON).toBe('supervisor instruction')
  })

  it('carries the instruction in both languages in the one string the route stores', () => {
    const text = defaultInstruction()
    expect(text).toContain('Mundur ke arah datangnya angin.')
    expect(text).toContain('Withdraw upwind. Do not engage.')
    expect(text.length).toBeLessThanOrEqual(500)
  })

  it('does not allow an empty selection, a blank instruction or one over 500 characters', () => {
    expect(formProblem([], 'x')).toBe('none_selected')
    expect(formProblem(['a'], '   ')).toBe('blank')
    expect(formProblem(['a'], 'x'.repeat(501))).toBe('too_long')
    expect(formProblem(['a'], 'x'.repeat(500))).toBeNull()
  })
})

describe('send withdraw: dialog', () => {
  it('matches the frame: title, recipient rows, instruction, reason, Cancel and a counted button', () => {
    const html = dialog()
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Send WITHDRAW at Ketapang, Kalimantan Barat · Pak Dedi · #1')
    expect(html).toContain('Volunteers on this incident')
    for (const name of ['Sari', 'Dedi', 'Volunteer IZAL']) expect(html).toContain(`>${name}</span>`)
    expect(html).toContain('Dispatch task · waiting for approval')
    expect(html.match(/type="checkbox"[^>]*checked=""/g)).toHaveLength(2)
    expect(html).toContain('Withdraw upwind. Do not engage.')
    expect(html).toContain('Reason saved: supervisor instruction.')
    expect(html).toContain('>Cancel</button>')
    expect(html).toContain('>Send WITHDRAW to 2</button>')
    expect(html).not.toMatch(/approve/i)
  })

  it('speaks Bahasa', () => {
    const html = dialog({}, 'id')
    expect(html).toContain('Kirim MUNDUR di Ketapang')
    expect(html).toContain('Relawan di insiden ini')
    expect(html).toContain('Kirim MUNDUR ke 2')
    expect(html).toContain('>Batal</button>')
  })

  it('does not write just by being drawn', () => {
    const send = vi.fn(async () => decision)
    dialog({ send })
    expect(send).not.toHaveBeenCalled()
  })

  it('blocks sending while offline and says why', () => {
    const html = dialog({ offline: true })
    expect(html).toMatch(/<button type="submit" class="inc-btn inc-btn-danger" disabled="">Offline · can’t send<\/button>/)
  })

  it('has a disabled button and a message when the incident has no volunteers', () => {
    const detail: IncidentDetail = { ...fixture('normal'), observations: [], tasks: [] }
    const html = dialog({}, 'en', detail)
    expect(html).toContain('No volunteers on this incident yet.')
    expect(html).toMatch(/disabled="">Send WITHDRAW to 0</)
  })
})

describe('send withdraw: submit and refusals', () => {
  const request = { volunteerIds: ['uid_sari'], instruction: 'Mundur', reasons: ['supervisor instruction'] }

  it('returns the audit id and the count after the route confirmed', async () => {
    const send = vi.fn(async () => decision)
    await expect(submitWithdraw(send, request, 'en')).resolves.toEqual({ ok: true, auditId: 'aud_9', count: 1 })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(request)
    expect(sentText('en', 2, 'aud_9')).toBe('WITHDRAW sent to 2 volunteers · audit aud_9')
    expect(sentText('en', 1, 'aud_9')).toBe('WITHDRAW sent to 1 volunteer · audit aud_9')
    expect(sentText('id', 2, 'aud_9')).toBe('MUNDUR terkirim ke 2 relawan · audit aud_9')
  })

  it('explains an unknown volunteer in plain language and says nothing changed', async () => {
    const send = async () => {
      throw new ApiError('validation_error', 'volunteerIds is not valid', 400, false, { volunteerIds: 'every id must already have an observation or a task on this incident' })
    }
    const result = await submitWithdraw(send, request, 'en')
    expect(result).toEqual({ ok: false, message: expect.stringContaining('no longer on this incident') })
    expect(JSON.stringify(result)).not.toMatch(/400|validation_error|volunteerIds/)
  })

  it('gives each failure its own message, in either language, with no codes or server text', () => {
    const cases: [unknown, RegExp][] = [
      [new ApiError('network', 'Network error', null, true), /Could not reach ember-api\. WITHDRAW was not sent/],
      [new ApiError('validation_error', 'instruction is not valid', 400, false, { instruction: 'required' }), /instruction was not accepted/],
      [new ApiError('forbidden', 'Supervisor role required', 403, false), /Sign in again as a supervisor/],
      [new ApiError('unauthorized', 'bad token', 401, false), /Sign in again as a supervisor/],
      [new ApiError('not_found', 'id is unknown', 404, false), /no longer exists/],
      [new ApiError('unavailable', 'HTTP 503', 503, true), /nothing was confirmed/],
      [new Error('TypeError: x is undefined'), /nothing was confirmed/],
    ]
    for (const [error, pattern] of cases) {
      const en = failureMessage(error, 'en')
      expect(en).toMatch(pattern)
      expect(en).not.toMatch(/\b(40[0-9]|50[1-9])\b|TypeError|HTTP|Supervisor role required|id is unknown/)
      expect(failureMessage(error, 'id')).not.toBe(en)
    }
  })
})

describe('send withdraw: the action on the incident', () => {
  const bar = (over: Partial<Parameters<typeof ActionBar>[0]> = {}) => {
    const detail = fixture('normal')
    return renderToStaticMarkup(
      <StaticRouter location="/console/incidents/inc_demo_01">
        <ActionBar lang="en" incident={detail.incident} offline={false} busy={false} onVerify={() => undefined} onSendWithdraw={() => undefined} onLowerSeverity={() => undefined} onExtinguish={() => undefined} {...over} />
      </StaticRouter>,
    )
  }

  it('offers Send withdraw on a live incident, disabled while offline or busy', () => {
    expect(bar()).toMatch(/<button type="button" class="inc-btn inc-btn-danger">Send withdraw<\/button>/)
    expect(bar({ offline: true })).toMatch(/inc-btn-danger" disabled="">Send withdraw/)
    expect(bar({ busy: true })).toMatch(/inc-btn-danger" disabled="">Send withdraw/)
  })

  it('does not offer it on an extinguished incident', () => {
    const detail = fixture('normal')
    expect(bar({ incident: { ...detail.incident, status: 'extinguished' } })).not.toContain('Send withdraw')
  })
})

describe('send withdraw: the route', () => {
  const headers = async () => ({ Authorization: 'Bearer t', 'X-Firebase-AppCheck': 'a' })

  it('posts the request to the existing withdraw route with no approval step', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(decision), { status: 200 }))
    const api = createHttpSupervisorApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    const request = { volunteerIds: ['uid_sari', 'uid_dedi'], instruction: 'Mundur', reasons: ['supervisor instruction'] }
    await expect(api.withdrawIncident('inc_1', request)).resolves.toEqual(decision)
    const [url, init] = (fetchImpl.mock.calls as unknown as [string, RequestInit][])[0]
    expect(url).toBe('https://api.example/incidents/inc_1/withdraw')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(request)
  })

  it('creates one approved withdraw task per recipient and activates the incident withdraw', async () => {
    const api = createMockSupervisorApi('sup_1', 'conflict', 0)
    const result = await api.withdrawIncident('inc_demo_01', { volunteerIds: ['uid_sari', 'uid_dedi'], instruction: ' Mundur ', reasons: ['supervisor instruction'] })
    expect(result.auditId).toMatch(/^aud_/)
    expect(result.incident.withdraw).toMatchObject({ active: true, instruction: 'Mundur', reasons: ['supervisor instruction'], volunteerIds: ['uid_sari', 'uid_dedi'], source: 'supervisor', safeVolunteerIds: [] })
    expect(Date.parse(result.incident.withdraw?.sentAt ?? '')).not.toBeNaN()
    const after = await api.getIncident('inc_demo_01')
    const withdraws = after.tasks.filter((t) => t.type === 'withdraw')
    expect(withdraws.map((t) => [t.volunteerId, t.status])).toEqual([['uid_sari', 'approved'], ['uid_dedi', 'approved']])
    expect(api.mock.audit.map((a) => a.action)).toContain('task.withdraw')
  })

  it('refuses a volunteer who is not on the incident and leaves the incident unchanged', async () => {
    const api = createMockSupervisorApi('sup_1', 'conflict', 0)
    const before = await api.getIncident('inc_demo_01')
    await expect(api.withdrawIncident('inc_demo_01', { volunteerIds: ['uid_sari', 'uid_ghost'], instruction: 'Mundur' })).rejects.toMatchObject({ status: 400 })
    expect(await api.getIncident('inc_demo_01')).toEqual(before)
    expect(api.mock.audit).toHaveLength(0)
  })

  it('refuses a blank instruction and an empty list', async () => {
    const api = createMockSupervisorApi('sup_1', 'conflict', 0)
    await expect(api.withdrawIncident('inc_demo_01', { volunteerIds: ['uid_sari'], instruction: '  ' })).rejects.toMatchObject({ status: 400 })
    await expect(api.withdrawIncident('inc_demo_01', { volunteerIds: [], instruction: 'Mundur' })).rejects.toMatchObject({ status: 400 })
  })

  it('adds recipients to an active withdraw and replaces its instruction, as the route does', async () => {
    const api = createMockSupervisorApi('sup_1', 'withdraw', 0)
    const result = await api.withdrawIncident('inc_demo_01', { volunteerIds: ['uid_dedi'], instruction: 'Newer instruction' })
    expect(result.incident.withdraw?.instruction).toBe('Newer instruction')
    expect(result.incident.withdraw?.volunteerIds).toEqual(['uid_dedi', 'uid_sari'])
  })
})

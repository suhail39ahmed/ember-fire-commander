import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ApiError } from '../../pwa/api/types'
import { formatTimeZone } from '../../pwa/formatTime'
import { createMockSupervisorApi } from '../api/mock'
import { createHttpSupervisorApi, SUPERVISOR_ENDPOINTS } from '../api/client'
import type { Task } from '../contracts'
import { fixture } from '../fixtures'
import { DeliveryLine } from '../detail/DeliveryLine'
import { deliveryCopy, resendFailureText } from '../detail/deliveryCopy'
import { countdownText, heardEvents, needsClock, receiptOf, submitResend } from '../detail/deliveryModel'
import { HeardToast } from '../detail/HeardToast'
import { volunteersOf } from '../detail/model'
import { VolunteerCard } from '../detail/VolunteerCard'

const SENT = '2026-10-17T03:20:00.000Z'
const OPENS = '2026-10-17T03:21:00.000Z'
const at = (s: string) => Date.parse(s)

function task(over: Partial<Task> = {}): Task {
  return { id: 't1', incidentId: 'inc_demo_01', volunteerId: 'uid_sari', type: 'verify', status: 'approved', instruction: 'Move 20 m north', sentAt: SENT, heardAt: null, sendCount: 1, resendAt: OPENS, ...over }
}

describe('delivery: the receipt', () => {
  it('is heard once the API has a heard time, whatever the clock says', () => {
    expect(receiptOf(task({ heardAt: '2026-10-17T03:20:23.000Z' }), at('2026-10-17T09:00:00Z'))).toEqual({ state: 'heard', heardAt: '2026-10-17T03:20:23.000Z' })
  })

  it('counts down to the resend time the API returned, then opens the resend', () => {
    expect(receiptOf(task(), at('2026-10-17T03:20:20Z'))).toEqual({ state: 'waiting', sentAt: SENT, resendIn: 40 })
    expect(receiptOf(task(), at('2026-10-17T03:20:59.200Z'))).toMatchObject({ state: 'waiting', resendIn: 1 })
    expect(receiptOf(task(), at('2026-10-17T03:21:00Z'))).toEqual({ state: 'overdue', sentAt: SENT })
    expect(receiptOf(task(), at('2026-10-17T03:40:00Z')).state).toBe('overdue')
  })

  it('does not invent a countdown when the API sent no resend time', () => {
    expect(receiptOf(task({ resendAt: null }), at(SENT))).toEqual({ state: 'waiting', sentAt: SENT, resendIn: null })
  })

  it('has no receipt for a task that was never sent, was rejected, or was sent before receipts', () => {
    expect(receiptOf(task({ status: 'proposed', sentAt: null, resendAt: null }), at(SENT)).state).toBe('none')
    expect(receiptOf(task({ status: 'rejected' }), at(SENT)).state).toBe('none')
    expect(receiptOf(task({ sentAt: undefined, resendAt: undefined }), at(SENT)).state).toBe('none')
    expect(receiptOf(null, at(SENT)).state).toBe('none')
  })

  it('writes the countdown as m:ss', () => {
    expect(countdownText(40)).toBe('0:40')
    expect(countdownText(125)).toBe('2:05')
    expect(countdownText(-3)).toBe('0:00')
  })

  it('needs a clock only while something is waiting', () => {
    expect(needsClock([task()], at('2026-10-17T03:20:10Z'))).toBe(true)
    expect(needsClock([task()], at('2026-10-17T03:22:00Z'))).toBe(false)
    expect(needsClock([task({ heardAt: SENT })], at(SENT))).toBe(false)
    expect(needsClock([], at(SENT))).toBe(false)
  })
})

describe('delivery: the heard toast events', () => {
  it('reports a task that was unheard and now is, once', () => {
    const before = [task(), task({ id: 't2', volunteerId: 'uid_dedi' })]
    const after = [task({ heardAt: '2026-10-17T03:20:23.000Z' }), task({ id: 't2', volunteerId: 'uid_dedi' })]
    expect(heardEvents(before, after)).toEqual([{ taskId: 't1', volunteerId: 'uid_sari', heardAt: '2026-10-17T03:20:23.000Z', text: 'Move 20 m north' }])
    expect(heardEvents(after, after)).toEqual([])
  })

  it('stays quiet on the first read and for tasks that appear already heard', () => {
    const heard = [task({ heardAt: SENT })]
    expect(heardEvents(null, heard)).toEqual([])
    expect(heardEvents([], heard)).toEqual([])
  })

  it('orders several by when they were heard', () => {
    const before = [task({ id: 'a' }), task({ id: 'b' })]
    const after = [task({ id: 'a', heardAt: '2026-10-17T03:20:40.000Z' }), task({ id: 'b', heardAt: '2026-10-17T03:20:30.000Z' })]
    expect(heardEvents(before, after).map((e) => e.taskId)).toEqual(['b', 'a'])
  })

  it('names who heard it, when, the text, and that it is logged, with no undo', () => {
    const html = renderToStaticMarkup(<HeardToast lang="en" name="Sari" event={{ taskId: 't1', volunteerId: 'uid_sari', heardAt: '2026-10-17T03:20:23.000Z', text: 'Move 20 m north' }} onClose={() => undefined} />)
    expect(html).toContain(`Sari heard it · ${formatTimeZone('2026-10-17T03:20:23.000Z')}`)
    expect(html).toContain('“Move 20 m north” · on their phone · logged')
    expect(html).toContain('UNDO NOT POSSIBLE · AUDIT')
    expect(html).not.toMatch(/>Undo<|batalkan/i)
    expect(html).toContain('aria-label="Dismiss"')
    expect(renderToStaticMarkup(<HeardToast lang="id" name="Sari" event={{ taskId: 't1', volunteerId: 'uid_sari', heardAt: SENT, text: 'x' }} onClose={() => undefined} />)).toContain('Sari mendengarnya')
  })
})

describe('delivery: the card line', () => {
  const resend = async () => ({ auditId: 'aud_4' })

  it('shows heard with the time', () => {
    const html = renderToStaticMarkup(<DeliveryLine lang="en" task={task({ heardAt: '2026-10-17T03:20:23.000Z' })} now={at(SENT)} onResend={resend} />)
    expect(html).toContain(`heard ✓ ${formatTimeZone('2026-10-17T03:20:23.000Z')}`)
    expect(html).not.toContain('Resend')
  })

  it('shows not heard, when it was sent and the resend countdown, without a resend button yet', () => {
    const html = renderToStaticMarkup(<DeliveryLine lang="en" task={task()} now={at('2026-10-17T03:20:20Z')} onResend={resend} />)
    expect(html).toContain(`Not heard yet · sent ${formatTimeZone(SENT)} · resend in 0:40`)
    expect(html).not.toContain('>Resend<')
  })

  it('offers Resend once it is open, and never an undo', () => {
    const html = renderToStaticMarkup(<DeliveryLine lang="en" task={task()} now={at('2026-10-17T03:22:00Z')} onResend={resend} />)
    expect(html).toContain(`Not heard · sent ${formatTimeZone(SENT)}`)
    expect(html).toContain('>Resend<')
    expect(html).not.toMatch(/undo/i)
  })

  it('falls back to the plain status when there is no receipt', () => {
    expect(renderToStaticMarkup(<DeliveryLine lang="en" task={task({ sentAt: undefined, resendAt: undefined })} now={at(SENT)} />)).toContain('>sent<')
    expect(renderToStaticMarkup(<DeliveryLine lang="en" task={task({ status: 'proposed', sentAt: null, resendAt: null })} now={at(SENT)} />)).toContain('waiting for approval')
  })

  it('speaks Bahasa', () => {
    const html = renderToStaticMarkup(<DeliveryLine lang="id" task={task()} now={at('2026-10-17T03:20:20Z')} />)
    expect(html).toContain('Belum didengar · terkirim')
    expect(html).toContain('kirim ulang dalam 0:40')
  })

  it('is on the volunteer card, under the last instruction', () => {
    const d = fixture('withdraw')
    d.tasks = d.tasks.map((t) => (t.type === 'withdraw' && t.volunteerId === 'uid_dedi' ? { ...t, sentAt: SENT, heardAt: null, sendCount: 1, resendAt: OPENS } : t))
    const row = volunteersOf(d).find((r) => r.id === 'uid_dedi')!
    const html = renderToStaticMarkup(<VolunteerCard lang="en" row={row} now={at('2026-10-17T03:22:00Z')} onResend={resend} />)
    expect(html).toContain('inc-delivery unheard')
    expect(html).toContain('>Resend<')
  })
})

describe('delivery: resending', () => {
  it('says it was sent again, with the audit id', async () => {
    expect(await submitResend(async () => ({ auditId: 'aud_4' }), 't1', 'en')).toEqual({ ok: true, text: 'Sent again · audit aud_4' })
    expect((await submitResend(async () => ({ auditId: 'aud_4' }), 't1', 'id')).text).toBe('Dikirim ulang · audit aud_4')
  })

  it.each([
    [new ApiError('network', 'Network error', null, true), /Could not reach ember-api.*not sent again/],
    [new ApiError('conflict', 'This instruction was already heard', 409, false), /just heard the instruction/],
    [new ApiError('conflict', 'Only a sent instruction can be sent again', 409, false), /can’t be sent again now/],
    [new ApiError('forbidden', 'x', 403, false), /cannot resend/],
    [new ApiError('not_found', 'x', 404, false), /no longer exists/],
    [new ApiError('internal', 'Firestore exploded', 500, true), /could not send this instruction again/],
    [new Error('boom'), /could not send this instruction again/],
  ])('explains a failed resend in plain words (%#)', async (error, expected) => {
    const result = await submitResend(async () => { throw error }, 't1', 'en')
    expect(result.ok).toBe(false)
    expect(result.text).toMatch(expected)
    expect(result.text).not.toMatch(/\b(409|403|404|500)\b|Firestore|Error/)
    expect(resendFailureText(error, 'id')).not.toBe(result.text)
  })

  it('has every label in both languages', () => {
    for (const [key, value] of Object.entries(deliveryCopy)) {
      expect(value.en, key).toBeTruthy()
      expect(value.id, key).toBeTruthy()
    }
  })
})

describe('delivery: the route and the mock', () => {
  it('posts to /tasks/{id}/resend', async () => {
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify({ task: task(), auditId: 'aud_4' }), { status: 200 })
    }) as unknown as typeof fetch
    const api = createHttpSupervisorApi(async () => ({ Authorization: 'Bearer t', 'X-Request-Id': 'r' }), 'https://api.example', fetchImpl)
    await api.resendTask('t1')
    expect(calls[0]).toBe(`https://api.example${SUPERVISOR_ENDPOINTS.resend('t1')}`)
    expect(SUPERVISOR_ENDPOINTS.resend('t1')).toBe('/tasks/t1/resend')
  })

  it('stamps the send on approve, counts the resend, audits both, and refuses what the route refuses', async () => {
    const api = createMockSupervisorApi('sup_1', 'conflict', 0)
    const before = await api.getIncident('inc_demo_01')
    const verify = before.tasks.find((t) => t.type === 'verify') as Task
    await expect(api.resendTask(verify.id)).rejects.toMatchObject({ status: 409 })
    const approved = await api.approveTask(verify.id)
    expect(approved.task).toMatchObject({ sendCount: 1, heardAt: null })
    expect(Date.parse(approved.task.resendAt ?? '') - Date.parse(approved.task.sentAt ?? '')).toBe(60000)
    const again = await api.resendTask(verify.id)
    expect(again.task.sendCount).toBe(2)
    expect(api.mock.audit.map((a) => a.action)).toEqual(['task.approve', 'task.resend'])
  })
})

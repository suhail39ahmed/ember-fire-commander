import { describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'

import { PhoneLayout } from '../layout/PhoneLayout'
import { fakeBrowser, outboxHandle, renderVolunteer, volunteerValue } from './volunteerKit'

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ signOut: async () => undefined, user: null, me: null }) }))
fakeBrowser()

const screen = (over: Parameters<typeof volunteerValue>[0] = {}, lang: 'en' | 'id' = 'en') =>
  renderVolunteer(<Routes><Route path="/pwa/*" element={<PhoneLayout />} /></Routes>, {
    path: '/pwa/report', lang, value: volunteerValue({ outbox: outboxHandle(), ...over }),
  })

const at = (html: string, needle: string) => {
  const index = html.indexOf(needle)
  expect(index, needle).toBeGreaterThan(-1)
  return index
}

describe('Report upload layout', () => {
  it('shows cards, shared attachments and notes without the old Video/Call tools', () => {
    const html = screen()
    expect(html).toContain('id="report-live-panel" class="report-live-panel" hidden=""')
    expect(html).not.toContain('report-live-tools')
    const order = ['Report fire', 'WHAT DO YOU SEE?', 'data-chip="asap"', 'Upload video', 'Upload photos', 'Note (optional)', 'Send report'].map((text) => at(html, text))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('shows report choices, note hint and location accuracy', () => {
    const html = screen()
    for (const text of ['Smoke, no flames yet', 'I can see flames', 'No fire here, or it is out', 'I need help right now', 'butuh bantuan', 'asap', 'e.g. thin smoke by the canal', 'Location attached automatically', '±10 m']) expect(html).toContain(text)
  })

  it('starts with the camera off until Record video is selected', () => {
    expect(screen()).toContain('data-camera="off"')
  })

  it('uses Bahasa for uploads and notes in Bahasa mode', () => {
    for (const text of ['APA YANG ANDA LIHAT?', 'Catatan (opsional)', 'Asap, belum ada api', 'Unggah video', 'Unggah foto']) expect(screen({}, 'id')).toContain(text)
  })

  it('does not render the removed call/coach interface, even when an earlier voice session has a result', () => {
    const html = screen({ talk: { ...volunteerValue().talk, transcript: 'Earlier speech', coach: { phase: 'done', replyText: 'Earlier reply', receivedAt: null, incidentLabel: null } } })
    expect(html).not.toContain('data-testid="hold-to-talk"')
    expect(html).not.toContain('data-testid="coach-reply"')
    expect(html).toContain('Upload photos')
    expect(html).toContain('Note (optional)')
  })
})

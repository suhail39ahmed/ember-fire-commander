import { describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'

import { PhoneLayout } from '../layout/PhoneLayout'
import { voiceStrings } from '../gateway/voiceStrings'
import { fakeBrowser, outboxHandle, renderVolunteer, volunteerValue } from './volunteerKit'

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ signOut: async () => undefined, user: null, me: null }) }))

fakeBrowser()

const view = (button: 'ready' | 'listening' | 'replying') => ({
  button,
  label: voiceStrings.button[button],
  status: voiceStrings.status[button === 'listening' ? 'listening' : button === 'replying' ? 'replying' : 'ready'],
  disabled: false,
})

const screen = (over: Parameters<typeof volunteerValue>[0] = {}, lang: 'en' | 'id' = 'en') =>
  renderVolunteer(
    <Routes>
      <Route path="/pwa/*" element={<PhoneLayout />} />
    </Routes>,
    { path: '/pwa/report', lang, value: volunteerValue({ outbox: outboxHandle(), ...over }) },
  )

const talk = (over: Partial<ReturnType<typeof volunteerValue>['talk']>) => ({ ...volunteerValue().talk, ...over })
const at = (html: string, needle: string) => {
  const i = html.indexOf(needle)
  expect(i, needle).toBeGreaterThan(-1)
  return i
}

describe('Report tab, ready (design 06)', () => {
  it('stacks camera panel, Hold to talk, the four cards, the note, Send report, then the photo and outbox', () => {
    const html = screen()
    const order = ['data-testid="camera-panel"', 'data-testid="hold-to-talk"', 'OR TAP WHAT YOU SEE', 'data-chip="asap"', 'Note (optional)', 'Send report', 'PHOTO UPLOAD'].map((n) => at(html, n))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('shows the four cards with their Bahasa word and description', () => {
    const html = screen({ talk: talk({ view: view('ready') }) })
    for (const text of ['Smoke, no flames yet', 'I can see flames', 'No fire here, or it is out', 'I need help right now', 'butuh bantuan', 'asap']) expect(html).toContain(text)
    expect(html).toContain('Voice ready · hold and speak Bahasa or English')
    expect(html).toContain('e.g. thin smoke by the canal')
    expect(html).toContain('Pick a card or write a note to send.')
    expect(html).toContain('±10 m') // the phone's own accuracy from position
  })

  it('starts with the camera off: nothing is requested before a tap', () => {
    const html = screen()
    expect(html).toContain('data-camera="off"')
    expect(html).toContain('aria-pressed="false"')
  })

  it('is fully in Bahasa in Bahasa mode', () => {
    const html = screen({}, 'id')
    for (const text of ['ATAU PILIH YANG ANDA LIHAT', 'Catatan (opsional)', 'Asap, belum ada api', 'Saya melihat api', 'KAMERA MATI']) expect(html).toContain(text)
  })

  it('never shows a model or tool name', () => {
    expect(screen()).not.toMatch(/gemini|cursor|grok/i)
    expect(screen({}, 'id')).not.toMatch(/gemini|cursor|grok/i)
  })

  it('has no stand-in camera inside Hold to talk any more', () => {
    expect(screen({ talk: talk({ view: view('listening') }) })).not.toContain('hold-camera')
  })
})

describe('Report tab, hold to talk (design 07)', () => {
  it('shows the live transcript card above the red button when the gateway sent words', () => {
    const html = screen({ talk: talk({ view: view('listening'), transcript: 'Api kecil di tepi kanal, dekat sekolah.' }) })
    expect(html).toContain('YOU · LIVE TRANSCRIPT')
    expect(html).toContain('“Api kecil di tepi kanal, dekat sekolah.”')
    expect(html).toContain('Listening · release to send')
    expect(at(html, 'YOU · LIVE TRANSCRIPT')).toBeLessThan(at(html, 'Listening · release to send'))
  })

  it('does not invent a transcript: with no words it shows the hint and no "YOU" label', () => {
    const html = screen({ talk: talk({ view: view('listening'), transcript: null }) })
    expect(html).toContain('data-testid="hold-transcript"')
    expect(html).toContain('Listening… release to send.')
    expect(html).not.toContain('YOU · LIVE TRANSCRIPT')
  })
})

describe('Report tab, coach reply (design 08)', () => {
  const coach = { phase: 'done' as const, replyText: 'Stay upwind.', receivedAt: '2026-10-17T07:12:00Z', incidentLabel: 'TOHOR-3' }

  it('shows the AI coach card above the replying pill, then the saved line', () => {
    const html = screen({ talk: talk({ view: view('replying'), coach }) })
    expect(html).toContain('AI COACH')
    expect(html).toContain('Stay upwind.')
    expect(html).toContain('Coach is replying…')
    expect(html).toContain('Saved as a report · TOHOR-3')
    const order = ['AI COACH', 'Coach is replying…', 'Saved as a report', 'OR TAP WHAT YOU SEE'].map((n) => at(html, n))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('shows no saved line and no reply text when the API and gateway gave none', () => {
    const html = screen({ talk: talk({ view: view('replying'), coach: { phase: 'replying', replyText: null, receivedAt: null, incidentLabel: null } }) })
    expect(html).toContain('AI COACH')
    expect(html).toContain('Waiting for the reply…')
    expect(html).not.toContain('Saved as a report')
  })

  it('shows nothing from the coach while idle', () => {
    const html = screen()
    expect(html).not.toContain('AI COACH')
    expect(html).not.toContain('data-testid="coach-reply"')
  })
})

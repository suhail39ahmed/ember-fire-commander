import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CameraPanel } from '../camera/CameraPanel'
import type { CameraState } from '../camera/cameraController'
import { cameraStrings } from '../camera/cameraStrings'
import { gatewayStrings } from '../gateway/gatewayStrings'
import { voiceStrings } from '../gateway/voiceStrings'

const render = (over: Partial<Parameters<typeof CameraPanel>[0]> = {}) =>
  renderToStaticMarkup(<CameraPanel lang="en" state="off" stream={null} onToggle={() => undefined} accuracyM={18} {...over} />)

describe('CameraPanel', () => {
  it('is off by default: camera-off icon, not pressed, a plain caption, and a hidden video', () => {
    const html = render()
    expect(html).toContain('data-camera="off"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('data-icon="camera-off"')
    expect(html).toContain('CAMERA OFF · TAP TO TURN ON')
    expect(html).toMatch(/<video[^>]*\shidden=/)
    expect(html).toContain('title="Turn camera on"')
  })

  it('shows the video, a pressed toggle and the camera icon while on', () => {
    const html = render({ state: 'on' })
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('data-icon="camera"')
    expect(html).not.toMatch(/<video[^>]*\shidden=/)
    expect(html).toContain('title="Turn camera off"')
  })

  it('has a video that works on iOS Safari: inline, muted, autoplay', () => {
    const html = render({ state: 'on' })
    const video = html.match(/<video[^>]*>/)![0]
    expect(video).toContain('playsinline')
    expect(video).toContain('muted')
    expect(video).toContain('autoplay')
  })

  it('says preview only unless frames really go to the coach', () => {
    expect(render({ state: 'on' })).toContain('LIVE CAMERA · PREVIEW ONLY')
    expect(render({ state: 'on' })).not.toContain('FPS')
    expect(render({ state: 'on', framesToCoach: true })).toContain('LIVE CAMERA · ~1 FPS TO COACH')
    // The 1 FPS claim never shows while the camera is off or broken.
    expect(render({ state: 'off', framesToCoach: true })).not.toContain('FPS')
    expect(render({ state: 'denied', framesToCoach: true })).not.toContain('FPS')
  })

  it('shows opening state while the browser prompt is open', () => {
    const html = render({ state: 'starting' })
    expect(html).toContain('OPENING CAMERA…')
    expect(html).toContain('aria-busy="true"')
  })

  it.each<[CameraState, string]>([
    ['denied', 'Camera is blocked. Open Site settings → Camera → Allow'],
    ['unavailable', 'No usable camera on this device.'],
    ['busy', 'Another app is using the camera.'],
    ['insecure', 'needs a secure (https) connection'],
  ])('explains %s in plain words and keeps the toggle', (state, text) => {
    const html = render({ state })
    expect(html).toContain('data-testid="camera-problem"')
    expect(html).toContain(text)
    expect(html).toContain('CAMERA NOT AVAILABLE')
    expect(html).toContain('data-testid="camera-toggle"')
    expect(html).toContain('aria-pressed="false"')
  })

  it('shows no problem line when the camera is fine', () => {
    for (const state of ['off', 'starting', 'on'] as const) expect(render({ state })).not.toContain('camera-problem')
  })

  it('shows the accuracy chip only when the phone has a fix, and never an invented wind chip', () => {
    expect(render()).toContain('±18 m')
    expect(render({ accuracyM: null })).not.toContain('±')
    expect(render()).not.toMatch(/wind/i)
  })

  it('has a back button only when there is somewhere to go', () => {
    expect(render()).not.toContain('cam-back')
    expect(render({ onBack: () => undefined })).toContain('aria-label="Back"')
  })

  it('labels the toggle for assistive tech and shows Bahasa in Bahasa mode', () => {
    expect(render()).toContain('aria-label="Camera"')
    const id = render({ lang: 'id', onBack: () => undefined })
    expect(id).toContain('aria-label="Kamera"')
    expect(id).toContain('aria-label="Kembali"')
    expect(id).toContain('KAMERA MATI · KETUK UNTUK MENYALAKAN')
    expect(id).toContain('title="Nyalakan kamera"')
  })
})

describe('copy rules for the report screens', () => {
  const leaves = (o: unknown): Array<{ id: string; en: string }> =>
    o && typeof o === 'object' && 'id' in o && 'en' in o ? [o as { id: string; en: string }] : o && typeof o === 'object' ? Object.values(o).flatMap(leaves) : []
  const all = [...leaves(cameraStrings), ...leaves(gatewayStrings), ...leaves(voiceStrings)]

  it('has both languages for every string', () => {
    expect(all.length).toBeGreaterThan(30)
    for (const leaf of all) {
      expect(leaf.id.trim()).not.toBe('')
      expect(leaf.en.trim()).not.toBe('')
    }
  })

  it('never names a model or a tool in the screen copy', () => {
    for (const leaf of all) expect(`${leaf.id} ${leaf.en}`).not.toMatch(/gemini|cursor|grok|claude|openai|gpt/i)
  })

  it('puts AI on the coach label, and not on what the volunteer said', () => {
    expect(gatewayStrings.coachLabel.en).toBe('AI COACH')
    expect(gatewayStrings.coachLabel.id).toMatch(/AI/)
    expect(gatewayStrings.youTranscript.en).toBe('YOU · LIVE TRANSCRIPT')
  })
})

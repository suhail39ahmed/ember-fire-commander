import { describe, expect, it, vi } from 'vitest'
import { appendTranscript, isSharedTranscriptEvent, mergeSharedTranscript, pipeTrackAudio, transcriptionUrl, type SharedTranscriptEvent } from './transcriptionStream'

describe('call speech transcript', () => {
  it('replays shared segment snapshots without duplicating partial or final text', () => {
    const event: SharedTranscriptEvent = { type: 'transcript.event', callId: 'call', speakerId: 'v', speakerName: 'Volunteer',
      eventId: '1', segmentId: 'segment1', sequence: 1, timestamp: '2026-10-18T10:00:00Z', text: 'Hello', finished: false }
    expect(isSharedTranscriptEvent(event, 'another-call')).toBe(false)
    expect(isSharedTranscriptEvent(event, 'call')).toBe(true)
    let lines = mergeSharedTranscript([], event)
    lines = mergeSharedTranscript(lines, { ...event, sequence: 2, eventId: '2', speakerId: 's', speakerName: 'Supervisor', segmentId: 'segment2', text: 'I hear you', finished: true })
    const final = { ...event, sequence: 3, eventId: '3', text: 'Hello there', finished: true }
    lines = mergeSharedTranscript(lines, final)
    expect(lines.map((line) => line.text)).toEqual(['Hello there', 'I hear you'])
    expect(mergeSharedTranscript(lines, final)).toBe(lines)
    expect(mergeSharedTranscript(lines, event)).toBe(lines)
    expect(lines[0].timestamp).toBe(event.timestamp)
  })
  it('keeps interleaved speakers separate and preserves chunk spacing', () => {
    let lines = appendTranscript([], 'v', 'Volunteer', 'There is', false)
    lines = appendTranscript(lines, 's', 'Supervisor', 'Where?', true)
    lines = appendTranscript(lines, 'v', 'Volunteer', ' smoke.', true)
    expect(lines.map((line) => [line.name, line.text, line.finished])).toEqual([
      ['Volunteer', 'There is smoke.', true], ['Supervisor', 'Where?', true],
    ])
    expect(appendTranscript(lines, 'v', 'Volunteer', '', true)).toEqual(lines)
    expect(appendTranscript(lines, 'v', 'Volunteer', 'Next sentence.', false)).toHaveLength(3)
  })

  it('builds a dedicated socket URL without putting credentials in it', () => {
    expect(transcriptionUrl('wss://voice.example/')).toBe('wss://voice.example/transcription-test')
    expect(transcriptionUrl('ws://localhost:8084')).toBe('ws://localhost:8084/transcription-test')
    expect(() => transcriptionUrl('https://voice.example')).toThrow()
  })

  it('sends PCM from a borrowed track, respects mute, and never stops call tracks', () => {
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn() })
    const source = node()
    const processor = { ...node(), onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null }
    const silent = { ...node(), gain: { value: 1 } }
    const context = { sampleRate: 48000, createMediaStreamSource: vi.fn(() => source), createScriptProcessor: vi.fn(() => processor), createGain: vi.fn(() => silent), destination: {}, close: vi.fn() }
    const track = { readyState: 'live', enabled: true, muted: false, stop: vi.fn() }
    vi.stubGlobal('MediaStream', class { constructor(readonly tracks: unknown[]) {} })
    try {
      const send = vi.fn()
      const stop = pipeTrackAudio(context as unknown as AudioContext, track as unknown as MediaStreamTrack, send)
      const output = new Float32Array([1, 1])
      const event = { inputBuffer: { getChannelData: () => new Float32Array(480) }, outputBuffer: { getChannelData: () => output } } as unknown as AudioProcessingEvent
      processor.onaudioprocess?.(event)
      expect(atob(send.mock.calls[0][0])).toHaveLength(320)
      expect(output).toEqual(new Float32Array(2))
      expect(silent.gain.value).toBe(0)
      track.enabled = false
      processor.onaudioprocess?.(event)
      expect(send).toHaveBeenCalledTimes(1)
      stop()
      expect(source.disconnect).toHaveBeenCalled()
      expect(processor.disconnect).toHaveBeenCalled()
      expect(track.stop).not.toHaveBeenCalled()
      expect(context.close).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })
})

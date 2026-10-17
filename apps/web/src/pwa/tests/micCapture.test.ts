import { describe, expect, it, vi } from 'vitest'
import { downsample, float32ToBase64Pcm16, MicCapture } from '../gateway/micCapture'

// ---------------------------------------------------------------------------
// Pure math helpers
// ---------------------------------------------------------------------------

describe('float32ToBase64Pcm16', () => {
  it('encodes silence (all zeros) to all-zero PCM', () => {
    const result = float32ToBase64Pcm16(new Float32Array(4))
    const bytes = Uint8Array.from(atob(result), (c) => c.charCodeAt(0))
    expect(bytes.every((b) => b === 0)).toBe(true)
  })

  it('clamps values outside [-1, 1]', () => {
    const samples = new Float32Array([2.0, -3.0, 0.5])
    const result = float32ToBase64Pcm16(samples)
    const bytes = Uint8Array.from(atob(result), (c) => c.charCodeAt(0))
    const int16 = new Int16Array(bytes.buffer)
    // 2.0 → clamped to 1.0 → 0x7fff
    expect(int16[0]).toBe(0x7fff)
    // -3.0 → clamped to -1.0 → -0x8000
    expect(int16[1]).toBe(-0x8000)
  })

  it('produces a valid base64 string', () => {
    const result = float32ToBase64Pcm16(new Float32Array([0.25, -0.25]))
    expect(() => atob(result)).not.toThrow()
    const bytes = Uint8Array.from(atob(result), (c) => c.charCodeAt(0))
    expect(bytes.byteLength).toBe(4) // 2 samples × 2 bytes
  })
})

describe('downsample', () => {
  it('returns input unchanged when rates are equal', () => {
    const input = new Float32Array([0.1, 0.2, 0.3])
    const out = downsample(input, 16000, 16000)
    expect(out).toBe(input)
  })

  it('halves the length when downsampling 2:1', () => {
    const input = new Float32Array(64)
    const out = downsample(input, 48000, 24000)
    expect(out.length).toBe(32)
  })

  it('produces output length proportional to ratio', () => {
    const input = new Float32Array(480)
    const out = downsample(input, 48000, 16000)
    expect(out.length).toBe(160)
  })
})

// ---------------------------------------------------------------------------
// MicCapture lifecycle — uses a fake env to avoid real getUserMedia
// ---------------------------------------------------------------------------

function makeFakeAudioNode() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null as ((ev: AudioProcessingEvent) => void) | null,
  }
}

function makeFakeEnv(overrides: Partial<{ getUserMediaFails: boolean; noAudioContext: boolean }> = {}) {
  const tracks: { stop: () => void }[] = [{ stop: vi.fn() }]
  const stream = { getTracks: () => tracks } as unknown as MediaStream
  const source = makeFakeAudioNode()
  const processor = { ...makeFakeAudioNode(), onaudioprocess: null as ((ev: AudioProcessingEvent) => void) | null }
  const destination = {}
  const ctx = {
    sampleRate: 48_000,
    createMediaStreamSource: vi.fn(() => source),
    createScriptProcessor: vi.fn(() => processor),
    destination,
    close: vi.fn(() => Promise.resolve()),
  }
  const FakeAudioContext = overrides.noAudioContext ? undefined : vi.fn(() => ctx)
  const mediaDevices = {
    getUserMedia: overrides.getUserMediaFails
      ? vi.fn(() => Promise.reject(new Error('NotAllowedError')))
      : vi.fn(() => Promise.resolve(stream)),
  }
  return {
    env: { mediaDevices, AudioContext: FakeAudioContext as unknown as typeof AudioContext },
    ctx,
    source,
    processor,
    tracks,
    stream,
  }
}

describe('MicCapture', () => {
  it('starts and captures audio, then stop releases all resources', async () => {
    const audios: string[] = []
    const { env, ctx, source, processor, tracks } = makeFakeEnv()
    const cap = new MicCapture({ onAudio: (b64) => audios.push(b64), env })

    await cap.start()
    expect(cap.active).toBe(true)
    expect(ctx.createMediaStreamSource).toHaveBeenCalled()

    // Simulate an audio process event (silence)
    const buf = { getChannelData: () => new Float32Array(4096) }
    processor.onaudioprocess?.({ inputBuffer: buf } as unknown as AudioProcessingEvent)
    expect(audios).toHaveLength(1)
    expect(() => atob(audios[0])).not.toThrow()

    cap.stop()
    expect(cap.active).toBe(false)
    expect(source.disconnect).toHaveBeenCalled()
    expect(processor.disconnect).toHaveBeenCalled()
    expect(tracks[0].stop).toHaveBeenCalled()
    expect(ctx.close).toHaveBeenCalled()
  })

  it('a second start before stop is a no-op', async () => {
    const { env, ctx } = makeFakeEnv()
    const cap = new MicCapture({ onAudio: () => {}, env })
    await cap.start()
    await cap.start()
    expect(ctx.createMediaStreamSource).toHaveBeenCalledTimes(1)
    cap.stop()
  })

  it('calls onError and does not throw when getUserMedia fails', async () => {
    const errors: unknown[] = []
    const { env } = makeFakeEnv({ getUserMediaFails: true })
    const cap = new MicCapture({ onAudio: () => {}, onError: (e) => errors.push(e), env })
    await cap.start()
    expect(cap.active).toBe(false)
    expect(errors).toHaveLength(1)
  })

  it('calls onError when AudioContext is not available', async () => {
    const errors: unknown[] = []
    const { env } = makeFakeEnv({ noAudioContext: true })
    const cap = new MicCapture({ onAudio: () => {}, onError: (e) => errors.push(e), env })
    await cap.start()
    expect(cap.active).toBe(false)
    expect(errors).toHaveLength(1)
  })

  it('stop before start is a no-op', () => {
    const cap = new MicCapture({ onAudio: () => {}, env: {} })
    expect(() => cap.stop()).not.toThrow()
    expect(cap.active).toBe(false)
  })
})

/**
 * Audio playback for gateway reply audio (contract §7).
 *
 * Gemini Live returns raw 16-bit signed PCM (little-endian) at 24 kHz. The
 * contract says the gateway does not set or convert the format, so the format
 * is whatever Gemini Live returns. We decode it as PCM directly rather than
 * using decodeAudioData (which requires a container format like WAV).
 *
 * Call `play(base64)` with each `audio` message from the gateway. Chunks are
 * queued and played in order so they do not overlap.
 */

export interface AudioPlayerEnv {
  AudioContext?: typeof AudioContext
}

/** Decode a base64-encoded Int16 PCM buffer to a Float32Array. */
export function pcm16Base64ToFloat32(base64: string, sampleRate = 24_000): AudioBuffer | null {
  if (typeof AudioContext === 'undefined' && typeof window === 'undefined') return null
  const Ctx = window.AudioContext ?? (window as unknown as Record<string, unknown>)['webkitAudioContext'] as typeof AudioContext | undefined
  if (!Ctx) return null
  let binary: string
  try {
    binary = atob(base64)
  } catch {
    return null
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const int16 = new Int16Array(bytes.buffer)
  const ctx = new Ctx({ sampleRate })
  const buf = ctx.createBuffer(1, int16.length, sampleRate)
  const channel = buf.getChannelData(0)
  for (let i = 0; i < int16.length; i++) {
    channel[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff)
  }
  void ctx.close()
  return buf
}

export class AudioPlayer {
  private ctx: AudioContext | null = null
  private nextAt = 0

  constructor(private readonly env: AudioPlayerEnv = {}) {}

  private _ctx(): AudioContext | null {
    const Ctx = this.env.AudioContext ?? (typeof window !== 'undefined'
      ? (window.AudioContext ?? (window as unknown as Record<string, unknown>)['webkitAudioContext'] as typeof AudioContext | undefined)
      : undefined)
    if (!Ctx) return null
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new Ctx()
      this.nextAt = 0
    }
    return this.ctx
  }

  /** Decode and enqueue one base64 PCM chunk. Chunks play back-to-back. */
  play(base64: string, sampleRate = 24_000): void {
    const ctx = this._ctx()
    if (!ctx) return
    let binary: string
    try {
      binary = atob(base64)
    } catch {
      return
    }
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const int16 = new Int16Array(bytes.buffer)
    if (int16.length === 0) return
    const buf = ctx.createBuffer(1, int16.length, sampleRate)
    const channel = buf.getChannelData(0)
    for (let i = 0; i < int16.length; i++) {
      channel[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff)
    }
    const source = ctx.createBufferSource()
    source.buffer = buf
    source.connect(ctx.destination)
    const startAt = Math.max(ctx.currentTime, this.nextAt)
    source.start(startAt)
    this.nextAt = startAt + buf.duration
  }

  /** Stop playback and close the AudioContext. */
  close(): void {
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined)
      this.ctx = null
      this.nextAt = 0
    }
  }
}

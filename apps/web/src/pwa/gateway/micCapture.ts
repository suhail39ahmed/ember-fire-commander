/**
 * Microphone capture for the voice gateway (contract §7).
 *
 * Opens a getUserMedia stream, downsamples the audio to 16 kHz mono PCM
 * (16-bit signed little-endian), base64-encodes each chunk, and calls
 * `onAudio` with the result. The caller passes that to PttSession.sendAudio().
 *
 * Uses a ScriptProcessorNode for broad browser support. The node runs on the
 * audio render thread so the main thread is not blocked by the conversion.
 *
 * Call `start()` when the session goes live; call `stop()` to release the mic
 * and the AudioContext. A second `start()` before `stop()` is a no-op.
 */

export interface MicCaptureEnv {
  mediaDevices?: {
    getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>
  }
  AudioContext?: typeof AudioContext
}

export interface MicCaptureDeps {
  onAudio: (base64: string) => void
  onError?: (err: unknown) => void
  env?: MicCaptureEnv
}

const TARGET_SAMPLE_RATE = 16_000
const BUFFER_SIZE = 4_096

function browserEnv(): MicCaptureEnv {
  if (typeof window === 'undefined') return {}
  return {
    mediaDevices: navigator.mediaDevices,
    AudioContext: window.AudioContext ?? (window as unknown as Record<string, unknown>)['webkitAudioContext'] as typeof AudioContext | undefined,
  }
}

/** Convert a Float32Array of audio samples to a base64-encoded Int16 PCM buffer. */
export function float32ToBase64Pcm16(samples: Float32Array): string {
  const buf = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buf[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  let binary = ''
  const bytes = new Uint8Array(buf.buffer)
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Downsample a Float32Array from `sourceRate` to `targetRate` using linear
 * interpolation. When rates are equal the input is returned unchanged.
 */
export function downsample(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (sourceRate === targetRate) return input
  const ratio = sourceRate / targetRate
  const outputLength = Math.round(input.length / ratio)
  const output = new Float32Array(outputLength)
  for (let i = 0; i < outputLength; i++) {
    const pos = i * ratio
    const idx = Math.floor(pos)
    const frac = pos - idx
    const a = input[idx] ?? 0
    const b = input[idx + 1] ?? a
    output[i] = a + frac * (b - a)
  }
  return output
}

export class MicCapture {
  private ctx: AudioContext | null = null
  private _stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private running = false

  constructor(private readonly deps: MicCaptureDeps) {}

  get active(): boolean {
    return this.running
  }

  /** The raw MediaStream from getUserMedia, or null when the mic is not open. */
  get stream(): MediaStream | null {
    return this._stream
  }

  async start(): Promise<void> {
    if (this.running) return
    const env = this.deps.env ?? browserEnv()
    if (!env.mediaDevices?.getUserMedia || !env.AudioContext) {
      this.deps.onError?.(new Error('mic capture not supported'))
      return
    }
    try {
      this._stream = await env.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
      this.ctx = new env.AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
      this.source = this.ctx.createMediaStreamSource(this._stream)
      // ScriptProcessorNode is deprecated but widely supported; AudioWorklet
      // requires a separate JS file which complicates the Vite build.
      this.processor = this.ctx.createScriptProcessor(BUFFER_SIZE, 1, 1)
      const sourceRate = this.ctx.sampleRate
      const { onAudio } = this.deps
      this.processor.onaudioprocess = (e) => {
        const raw = e.inputBuffer.getChannelData(0)
        const resampled = downsample(raw, sourceRate, TARGET_SAMPLE_RATE)
        onAudio(float32ToBase64Pcm16(resampled))
      }
      this.source.connect(this.processor)
      // Connect to destination to keep the graph alive (required in some browsers).
      this.processor.connect(this.ctx.destination)
      this.running = true
    } catch (err) {
      this.deps.onError?.(err)
      this.stop()
    }
  }

  stop(): void {
    if (this.processor) {
      this.processor.disconnect()
      this.processor.onaudioprocess = null
      this.processor = null
    }
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this._stream) {
      for (const track of this._stream.getTracks()) track.stop()
      this._stream = null
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined)
      this.ctx = null
    }
    this.running = false
  }
}

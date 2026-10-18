import { downsample, float32ToBase64Pcm16 } from '../pwa/gateway/micCapture'

export interface TranscriptLine {
  speaker: string; name: string; text: string; finished: boolean
  callId?: string; segmentId?: string; eventId?: string; sequence?: number; timestamp?: string
}

export interface SharedTranscriptEvent {
  type: 'transcript.event'; callId: string; speakerId: string; speakerName: string
  eventId: string; segmentId: string; sequence: number; timestamp: string; text: string; finished: boolean
}

export function isSharedTranscriptEvent(value: unknown, callId: string): value is SharedTranscriptEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return event.type === 'transcript.event' && event.callId === callId
    && Number.isSafeInteger(event.sequence) && (event.sequence as number) > 0
    && ['speakerId', 'speakerName', 'eventId', 'segmentId', 'timestamp', 'text'].every((key) => typeof event[key] === 'string')
    && Number.isFinite(Date.parse(event.timestamp as string)) && typeof event.finished === 'boolean'
}

/** Shared events contain cumulative segment text, so replay replaces rather than appends chunks. */
export function mergeSharedTranscript(lines: TranscriptLine[], event: SharedTranscriptEvent): TranscriptLine[] {
  const index = lines.findIndex((line) => line.callId === event.callId && line.segmentId === event.segmentId)
  if (index >= 0 && (lines[index].sequence ?? 0) >= event.sequence) return lines
  const line: TranscriptLine = { speaker: event.speakerId, name: event.speakerName, text: event.text,
    finished: event.finished, callId: event.callId, segmentId: event.segmentId, eventId: event.eventId,
    sequence: event.sequence, timestamp: event.timestamp }
  const next = [...lines]
  if (index >= 0) next[index] = line
  else if (event.text.trim()) next.push(line)
  return next.slice(-200)
}

/** Gemini input transcription arrives as text chunks, not model reply text. */
export function appendTranscript(lines: TranscriptLine[], speaker: string, name: string, text: string, finished: boolean): TranscriptLine[] {
  const next = [...lines]
  let index = -1
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].speaker === speaker && !next[i].finished) { index = i; break }
  }
  if (index >= 0) next[index] = { ...next[index], text: next[index].text + text, finished }
  else if (text.trim()) next.push({ speaker, name, text, finished })
  return next.slice(-200)
}

export function transcriptionUrl(base: string): string {
  const url = new URL(base)
  if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Voice gateway URL must use ws or wss.')
  url.pathname = `${url.pathname.replace(/\/$/, '')}/transcription-test`
  url.search = ''
  url.hash = ''
  return url.toString()
}

/** Read an existing call track. Never acquires or stops the call's microphone. */
export function pipeTrackAudio(context: AudioContext, track: MediaStreamTrack, send: (audio: string) => void): () => void {
  const source = context.createMediaStreamSource(new MediaStream([track]))
  const processor = context.createScriptProcessor(4096, 1, 1)
  const silent = context.createGain()
  silent.gain.value = 0
  processor.onaudioprocess = (event) => {
    event.outputBuffer.getChannelData(0).fill(0)
    if (track.readyState === 'live' && track.enabled && !track.muted) {
      send(float32ToBase64Pcm16(downsample(event.inputBuffer.getChannelData(0), context.sampleRate, 16000)))
    }
  }
  source.connect(processor)
  processor.connect(silent)
  silent.connect(context.destination)
  return () => { processor.onaudioprocess = null; source.disconnect(); processor.disconnect(); silent.disconnect() }
}

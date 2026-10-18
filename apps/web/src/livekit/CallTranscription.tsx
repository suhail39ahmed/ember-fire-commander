import { useEffect, useRef, useState } from 'react'
import { useConnectionState, useTracks } from '@livekit/components-react'
import { ConnectionState, Track } from 'livekit-client'

import { useAuth } from '../auth/AuthProvider'
import { authHeadersFor } from '../pwa/api/authHeaders'
import { API_BASE_URL, GATEWAY_WSS_URL } from '../pwa/api/config'
import { isSharedTranscriptEvent, mergeSharedTranscript, pipeTrackAudio, transcriptionUrl, type TranscriptLine } from './transcriptionStream'
import { TranscriptLog } from './TranscriptLog'

export function CallTranscription({ callId, context, error, onRetry, product = false }: {
  callId: string; context: AudioContext | null; error: string | null; onRetry: () => void; product?: boolean
}) {
  const { user } = useAuth()
  const tracks = useTracks([Track.Source.Microphone], { onlySubscribed: true })
  const connection = useConnectionState()
  const connected = connection === ConnectionState.Connected
  const localTrack = tracks.find((ref) => ref.participant.isLocal && !ref.publication.isMuted)?.publication.track?.mediaStreamTrack
  const [lines, setLines] = useState<TranscriptLine[]>([])
  const [status, setStatus] = useState('Connecting to shared transcript…')
  const [ready, setReady] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [audioStatus, setAudioStatus] = useState('')
  const [audioAllowed, setAudioAllowed] = useState(true)
  const cursor = useRef(0)
  const socketRef = useRef<WebSocket | null>(null)
  const problem = error || (!GATEWAY_WSS_URL ? 'Voice gateway URL is not configured.' : null)

  useEffect(() => {
    if (!connected || !user || !GATEWAY_WSS_URL) return
    let disposed = false
    let reconnect: number | undefined
    let deadline: number | undefined
    let attempt = 0
    let terminal = false
    let current: WebSocket | null = null
    const controller = new AbortController()
    function scheduleReconnect() {
      if (disposed || terminal || reconnect !== undefined) return
      setReady(false)
      setPublishing(false)
      setStatus('Reconnecting to shared transcript…')
      reconnect = window.setTimeout(() => { reconnect = undefined; void open() }, Math.min(1000 * 2 ** attempt++, 10000))
    }
    async function open() {
      try {
        const headers = await authHeadersFor(user)()
        if (disposed || !headers) return
        const response = await fetch(`${API_BASE_URL}/voice/ticket`, { method: 'POST', headers: { ...headers }, signal: controller.signal })
        const body = await response.json()
        if (!response.ok || typeof body.ticket !== 'string') throw new Error('Voice authorization failed')
        if (disposed) return
        const url = new URL(transcriptionUrl(GATEWAY_WSS_URL))
        if (product) url.pathname = '/calls/transcription'
        const socket = new WebSocket(url.toString(), [body.ticket])
        current = socketRef.current = socket
        deadline = window.setTimeout(() => socket.close(), 25000)
        socket.onopen = () => socket.send(JSON.stringify({ type: 'session.start', callId, afterSequence: cursor.current }))
        socket.onmessage = (event) => {
          if (disposed || current !== socket) return
          let message: Record<string, unknown>
          try { message = JSON.parse(event.data) } catch { return }
          if (message.type === 'session.ready' && message.callId === callId) {
            window.clearTimeout(deadline)
            attempt = 0
            setReady(true)
            setAudioAllowed(true)
            setStatus('Shared transcript connected')
          } else if (isSharedTranscriptEvent(message, callId) && message.sequence > cursor.current) {
            cursor.current = message.sequence
            setLines((old) => mergeSharedTranscript(old, message))
          } else if (message.type === 'audio.ready') {
            setPublishing(true)
            setAudioStatus('Your microphone is being transcribed')
          } else if (message.type === 'audio.closed') {
            setPublishing(false)
            setAudioAllowed(false)
            setAudioStatus(message.reason === 'publisher_busy' ? 'Your other session supplies your speech; shared history remains connected.'
              : message.reason === 'time_limit' ? product ? 'Transcription time limit reached.' : 'Your two-minute audio test finished. Shared history remains connected.'
                : message.reason === 'transcription_unavailable' ? 'Gemini could not start your microphone transcription. Shared history remains connected.'
                : 'Your microphone transcription limit was reached. Shared history remains connected.')
          } else if (message.type === 'session.closed') {
            terminal = ['forbidden', 'test_disabled', 'invalid_start', 'unauthorized'].includes(String(message.reason))
            if (terminal) setStatus(product ? 'Call transcription has ended.' : 'Shared transcript access denied or test disabled. Rejoin the test call.')
            socket.close()
          }
        }
        socket.onerror = () => socket.close()
        socket.onclose = () => {
          window.clearTimeout(deadline)
          if (disposed) return
          if (current === socket) {
            socketRef.current = null
            setReady(false)
            setPublishing(false)
            scheduleReconnect()
          }
        }
      } catch {
        if (!disposed) scheduleReconnect()
      }
    }
    void open()
    return () => {
      disposed = true
      controller.abort()
      window.clearTimeout(reconnect)
      window.clearTimeout(deadline)
      try {
        if (current?.readyState === WebSocket.OPEN) current.send(JSON.stringify({ type: 'session.stop' }))
      } catch { /* Socket closed during cleanup. */ }
      current?.close()
      socketRef.current = null
    }
  }, [callId, connected, user, product])

  useEffect(() => {
    if (!ready || !context || !localTrack || !audioAllowed) return
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: 'audio.start' }))
    setAudioStatus('Connecting your microphone to Gemini Live…')
    return () => {
      setPublishing(false)
      try {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'audio.stop' }))
      } catch { /* Socket closed during cleanup. */ }
    }
  }, [ready, context, localTrack, audioAllowed])

  useEffect(() => {
    if (!context || !localTrack || !publishing) return
    try {
      return pipeTrackAudio(context, localTrack, (audio) => {
        const socket = socketRef.current
        if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 65536) {
          socket.send(JSON.stringify({ type: 'audio', data: audio }))
        } else if (socket?.readyState === WebSocket.OPEN) {
          setAudioStatus('Audio upload is congested; some speech may be missing.')
        }
      })
    } catch { setAudioStatus('Could not read your microphone. Shared history remains connected.') }
  }, [context, localTrack, publishing])

  return <section className={product ? 'call-transcription incident-transcript' : 'call-transcription'} aria-label="Shared call transcription">
    <h3>{product ? 'LIVE TRANSCRIPTION · GEMINI · CHECK IT YOURSELF' : 'Shared speech transcription'}</h3>
    {!product && <p className="small">Call {callId.slice(0, 12)} · Both screens receive the same transcript.</p>}
    <p className="small" role="status">{status}</p>
    {audioStatus && <p className="small" role="status">{audioStatus}</p>}
    {problem && <p role="alert">{problem}</p>}
    {error && <button type="button" onClick={onRetry}>Retry microphone transcription</button>}
    {product && !context && <button type="button" onClick={onRetry}>Enable audio transcription</button>}
    {!lines.length && <p className="muted small">{ready ? 'Waiting for speech from the call participants…' : 'Loading shared transcript…'}</p>}
    <TranscriptLog lines={lines} />
  </section>
}

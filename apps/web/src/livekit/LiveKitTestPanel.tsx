import { useEffect, useRef, useState } from 'react'
import {
  ControlBar, LiveKitRoom, ParticipantTile, RoomAudioRenderer, StartAudio,
  useConnectionState, useParticipants, useTracks,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'

import { useAuth } from '../auth/AuthProvider'
import { authHeadersFor } from '../pwa/api/authHeaders'
import { API_BASE_URL } from '../pwa/api/config'
import './livekitTest.css'
import { CallTranscription } from './CallTranscription'

interface Credentials { serverUrl: string; participantToken: string; callId: string; speakerId: string }

function newTestCode() {
  return crypto.randomUUID ? crypto.randomUUID().slice(0, 13) : ''
}

function TestMedia({ callId, transcriptionContext, transcriptionError, onRetryTranscription }: {
  callId: string
  transcriptionContext: AudioContext | null; transcriptionError: string | null; onRetryTranscription: () => void
}) {
  const state = useConnectionState()
  const participants = useParticipants()
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }])
  return <>
    <p role="status">{state} · {participants.length} participant(s)
      {participants.length < 2 ? ' · Waiting for the other person to join this code.' : ''}
    </p>
    <div className="livekit-test-grid">
      {tracks.map((track) => <ParticipantTile key={track.participant.identity} trackRef={track} />)}
    </div>
    <RoomAudioRenderer />
    <StartAudio label="Enable incoming audio" />
    <ControlBar controls={{ microphone: true, camera: true, screenShare: false, chat: false, leave: true }} />
    <CallTranscription key={callId} callId={callId} context={transcriptionContext} error={transcriptionError} onRetry={onRetryTranscription} />
  </>
}

export default function LiveKitTestPanel({ role, initialVideo = true, variant }: {
  role: 'volunteer' | 'supervisor'; initialVideo?: boolean; variant?: 'profile'
}) {
  const { user } = useAuth()
  const [mode, setMode] = useState<'start' | 'join'>(role === 'volunteer' ? 'start' : 'join')
  const [roomCode, setRoomCode] = useState(() => role === 'volunteer' ? newTestCode() : '')
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcriptionContext, setTranscriptionContext] = useState<AudioContext | null>(null)
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)
  const transcriptionRef = useRef<AudioContext | null>(null)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => {
    const controller = pending.current
    pending.current = null
    controller?.abort()
    void transcriptionRef.current?.close()
    transcriptionRef.current = null
  }, [])

  function stopTranscription() {
    void transcriptionRef.current?.close()
    transcriptionRef.current = null
    setTranscriptionContext(null)
  }

  // Prime Web Audio from the Join gesture so automatic transcription also works
  // in browsers that require user activation before resuming an AudioContext.
  function prepareTranscription() {
    setTranscriptionError(null)
    try {
      const next = new AudioContext()
      transcriptionRef.current = next
      void next.resume().then(() => {
        if (transcriptionRef.current === next) setTranscriptionContext(next)
      }).catch(() => {
        if (transcriptionRef.current === next) {
          stopTranscription()
          setTranscriptionError('Could not start audio processing. Retry transcription below.')
        }
      })
    } catch {
      setTranscriptionError('Audio processing is unavailable. Retry transcription below.')
    }
  }

  async function connect() {
    if (pending.current) return
    setError(null)
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera and microphone need HTTPS (or localhost).')
      return
    }
    if (!user) { setError('Sign in with a real volunteer or supervisor account to test.'); return }
    if (role === 'volunteer' && /^CALL-/i.test(roomCode.trim())) {
      if (!/^CALL-[0-9A-F]{4}-[0-9A-F]{4}$/i.test(roomCode.trim())) {
        setError('Enter the complete CALL-XXXX-XXXX code from the supervisor console.'); return
      }
      window.dispatchEvent(new CustomEvent('ember-join-call-code', { detail: { code: roomCode.trim(), video: initialVideo } }))
      return
    }
    prepareTranscription()
    const controller = new AbortController()
    pending.current = controller
    setLoading(true)
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      const headers = await authHeadersFor(user)()
      if (controller.signal.aborted) throw new Error('Connection request cancelled or timed out.')
      const response = await fetch(`${API_BASE_URL}/livekit/test-token`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: roomCode.trim() }), signal: controller.signal,
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message || `Token request failed (${response.status}).`)
      if (typeof body.serverUrl !== 'string' || typeof body.participantToken !== 'string' || typeof body.callId !== 'string' || typeof body.speakerId !== 'string') {
        throw new Error('The API returned incomplete LiveKit credentials.')
      }
      if (controller.signal.aborted) throw new Error('Connection request cancelled or timed out.')
      setCredentials(body)
    } catch (err) {
      if (pending.current === controller) {
        stopTranscription()
        setError(controller.signal.aborted ? 'Connection request cancelled or timed out. Try again.'
          : err instanceof Error ? err.message : 'Could not connect.')
      }
    } finally {
      window.clearTimeout(timeout)
      if (pending.current === controller) { pending.current = null; setLoading(false) }
    }
  }

  return <div className={`livekit-test-panel${variant === 'profile' ? ' livekit-test-panel-profile' : ''}`}>
    <h2>{variant === 'profile' ? 'Test a call' : 'LiveKit video test'}</h2>
    <p>Use the same test code on both screens. Joining shares your {initialVideo ? 'camera and microphone' : 'microphone'} with everyone in this test room.</p>
    <p>Use headphones. Close other camera/voice tools before joining.</p>
    <p>Speech transcription starts automatically when connected, using Gemini Live.</p>
    {role === 'volunteer' && <p>A supervisor’s <strong>CALL-XXXX-XXXX</strong> code joins their incident call and shared transcript. Choose Receive / Join and enter the code below.</p>}
    {!credentials && <div className="livekit-test-directions" role="group" aria-label="Test call direction">
      <button type="button" disabled={loading} aria-pressed={mode === 'start'}
        onClick={() => { setMode('start'); setRoomCode(newTestCode()); setError(null) }}>
        Start a new test call
      </button>
      <button type="button" disabled={loading} aria-pressed={mode === 'join'}
        onClick={() => { setMode('join'); setRoomCode(''); setError(null) }}>
        Receive / Join a test call
      </button>
    </div>}
    <p>{mode === 'start'
      ? `Share this code with the ${role === 'supervisor' ? 'volunteer' : 'supervisor'}, then connect. They choose Receive / Join and enter it.`
      : `Enter the code from the ${role === 'supervisor' ? 'volunteer' : 'supervisor'}, then join.`}</p>
    <label>Test code
      <input aria-label="LiveKit test code" value={roomCode} disabled={loading || !!credentials}
        onChange={(event) => setRoomCode(event.target.value)} autoCapitalize="none" autoComplete="off" spellCheck={false} />
    </label>
    {error && <p role="alert">{error}</p>}
    {!credentials && <button type="button" onClick={() => { void connect() }}
      disabled={loading || !/^[a-zA-Z0-9-]{8,48}$/.test(roomCode.trim())}>
      {loading ? 'Connecting…' : `${mode === 'start' ? 'Connect' : 'Receive / Join with'} ${initialVideo ? 'camera + microphone' : 'microphone'}`}
    </button>}
    {credentials && <LiveKitRoom token={credentials.participantToken} serverUrl={credentials.serverUrl}
      connect audio video={initialVideo} data-lk-theme="default"
      onDisconnected={() => { setCredentials(null); stopTranscription() }}
      onError={(err) => { setError(err.message); setCredentials(null); stopTranscription() }}
      onMediaDeviceFailure={() => setError('Camera or microphone unavailable. Check browser permissions and other apps; use the controls below to retry.')}>
      <TestMedia callId={credentials.callId} transcriptionContext={transcriptionContext} transcriptionError={transcriptionError} onRetryTranscription={prepareTranscription} />
    </LiveKitRoom>}
  </div>
}

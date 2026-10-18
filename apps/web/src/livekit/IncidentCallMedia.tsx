import { useEffect, useRef, useState } from 'react'
import { LiveKitRoom, RoomAudioRenderer, StartAudio, VideoTrack, useTracks, useLocalParticipant, useConnectionState, useRemoteParticipants } from '@livekit/components-react'
import { ConnectionState, LocalVideoTrack, Track } from 'livekit-client'
import type { CallController } from './calls'
import { CallTranscription } from './CallTranscription'
import './incidentCall.css'

async function captureFrame(video: HTMLVideoElement | null | undefined, maxWidth = 1280): Promise<Blob> {
  if (!video?.videoWidth || video.readyState < 2) throw new Error('A live video frame is not available yet.')
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(video.videoWidth, maxWidth); canvas.height = video.videoHeight * canvas.width / video.videoWidth
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
  if (!blob) throw new Error('Could not capture the current frame.')
  return blob
}

function Media({ controller, volunteer, onSnapshot }: { controller: CallController; volunteer: boolean; onSnapshot?: (blob: Blob) => Promise<void> }) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, cameraTrack } = useLocalParticipant()
  const state = useConnectionState()
  const peers = useRemoteParticipants()
  const tracks = useTracks([Track.Source.Camera])
  // The server identifies the volunteer's feed; local/remote alone is not an identity.
  // Keep the previous role-based selection while an older API is rolling out.
  const cameraIdentity = controller.credentials?.volunteerSpeakerId
    ?? (volunteer ? controller.credentials?.speakerId : undefined)
  const track = tracks.find((item) => item.participant.isLocal === volunteer
    && (!cameraIdentity || item.participant.identity === cameraIdentity))
  const stage = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [visionStatus, setVisionStatus] = useState('')
  const facing = useRef<'environment' | 'user'>('environment')
  const connected = state === ConnectionState.Connected
  const setConnected = controller.setConnected
  const liveVideo = Boolean(connected && track && !track.publication.isMuted)
  const callId = controller.call!.id
  const request = controller.request
  useEffect(() => {
    if (volunteer || !liveVideo) return
    let disposed = false
    let pending = false
    async function describe() {
      if (pending || disposed) return
      pending = true
      try {
        const image = await captureFrame(stage.current?.querySelector('video'), 640)
        await request(`/calls/${callId}/vision`, 'POST', image)
        if (!disposed) setVisionStatus('Selected frames checked about once a minute.')
      } catch {
        if (!disposed) setVisionStatus('Visual interpretation is unavailable. Audio transcription continues.')
      } finally { pending = false }
    }
    const first = window.setTimeout(() => void describe(), 5000)
    const timer = window.setInterval(() => void describe(), 60000)
    return () => { disposed = true; window.clearTimeout(first); window.clearInterval(timer) }
  }, [liveVideo, volunteer, callId, request])
  useEffect(() => { setConnected(connected); return () => setConnected(false) }, [connected, setConnected])

  async function toggleMic() {
    try { controller.primeAudio(); await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); setError('') }
    catch { setError('Microphone unavailable. Allow microphone permission and try again.') }
  }
  async function snapshot() {
    const video = stage.current?.querySelector('video')
    if (!video || !video.videoWidth || !onSnapshot) return
    setSaving(true); setSaved(false)
    try {
      const blob = await captureFrame(video)
      await onSnapshot(blob); setSaved(true)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save snapshot.') }
    finally { setSaving(false) }
  }
  return <>
    <div className="incident-video-stage" ref={stage}>
      {liveVideo && track ? <VideoTrack trackRef={track} /> : <div className="incident-video-placeholder">
        <span className="call-state-label">{connected ? 'AUDIO ONLY' : 'CONNECTING'}</span>
        <strong>{connected ? 'Camera is off' : state === ConnectionState.Reconnecting ? 'Reconnecting…' : 'Connecting the call…'}</strong>
        <p>{connected ? 'You can still speak and hear each other.' : 'Waiting for a secure connection.'}</p>
      </div>}
      {liveVideo && <span className="incident-live-badge">● LIVE · {volunteer ? 'Your camera' : `${controller.call!.volunteerName}’s camera`}</span>}
      {connected && peers.length === 0 && <span className="incident-peer-wait">Waiting for the other participant…</span>}
    </div>
    <RoomAudioRenderer />
    <StartAudio label="Enable incoming audio" />
    <div className="incident-call-controls">
      <button type="button" aria-pressed={isMicrophoneEnabled} onClick={() => void toggleMic()}>{isMicrophoneEnabled ? '● Mic on · Mute' : 'Mic off · Unmute'}</button>
      {volunteer && <>
        <button type="button" aria-pressed={isCameraEnabled} onClick={() => void localParticipant.setCameraEnabled(!isCameraEnabled).catch(() => setError('Allow camera permission and try again.'))}>{isCameraEnabled ? 'Camera off' : 'Camera on'}</button>
        <button type="button" disabled={!isCameraEnabled} onClick={() => {
          facing.current = facing.current === 'environment' ? 'user' : 'environment'
          const video = cameraTrack?.track
          if (video instanceof LocalVideoTrack) void video.restartTrack({ facingMode: facing.current }).catch(() => setError('Could not switch cameras.'))
        }}>Flip camera</button>
      </>}
      {onSnapshot && <button type="button" disabled={!liveVideo || saving} onClick={() => void snapshot()}>{saving ? 'Saving…' : saved ? '✓ Saved to incident' : 'Snapshot'}</button>}
      <button type="button" className="call-end" disabled={controller.busy} onClick={() => void controller.end()}>End live session</button>
    </div>
    {error && <p className="call-error" role="alert">{error}</p>}
    <CallTranscription key={controller.call!.id} callId={controller.call!.id} context={controller.context} error={null} onRetry={controller.primeAudio} product />
    {controller.call?.visualObservation && <section className="incident-transcript call-vision"><h3>{new Date(controller.call.visualObservation.at).toLocaleTimeString()} · GEMINI SEES THE FRAME</h3><p>{controller.call.visualObservation.text}</p><small>AI interpretation · Check against the live view.</small></section>}
    {visionStatus && <p className="call-vision-status">{visionStatus}</p>}
  </>
}

export default function IncidentCallMedia({ controller, volunteer = false, onSnapshot }: { controller: CallController; volunteer?: boolean; onSnapshot?: (blob: Blob) => Promise<void> }) {
  const credentials = controller.credentials
  if (!credentials) return null
  return <LiveKitRoom serverUrl={credentials.serverUrl} token={credentials.participantToken} connect audio
    video={volunteer && controller.video ? { facingMode: 'environment' } : false}
    options={{ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { resolution: { width: 640, height: 480, frameRate: 15 } } }}
    onError={(err) => controller.setError(err.message)}
    onDisconnected={() => { controller.setConnected(false); void controller.end() }}>
    <Media controller={controller} volunteer={volunteer} onSnapshot={onSnapshot} />
  </LiveKitRoom>
}

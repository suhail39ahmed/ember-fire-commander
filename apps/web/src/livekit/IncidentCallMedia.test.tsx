import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IncidentCallMedia from './IncidentCallMedia'
import type { CallController } from './calls'

const media = vi.hoisted(() => ({
  tracks: [] as { participant: { identity: string; isLocal: boolean }; publication: { isMuted: boolean } }[],
  room: {} as { video?: unknown; audio?: unknown },
}))
vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: (props: { children: ReactNode; video?: unknown; audio?: unknown }) => {
    media.room = props
    return <>{props.children}</>
  },
  VideoTrack: ({ trackRef }: { trackRef: { participant: { identity: string } } }) => <video data-owner={trackRef.participant.identity} />,
  RoomAudioRenderer: () => null,
  StartAudio: () => null,
  useTracks: () => media.tracks,
  useLocalParticipant: () => ({ localParticipant: {}, isMicrophoneEnabled: true, isCameraEnabled: true }),
  useConnectionState: () => 'connected',
  useRemoteParticipants: () => [{ identity: 'peer' }],
}))
vi.mock('./CallTranscription', () => ({ CallTranscription: () => null }))

function controller(volunteer: boolean, video = true): CallController {
  return {
    call: { id: 'call-1', volunteerName: 'Sari' },
    credentials: {
      serverUrl: 'wss://test.livekit.cloud', participantToken: 'test', callId: 'call-1',
      speakerId: volunteer ? 'volunteer-speaker' : 'supervisor-speaker',
      volunteerSpeakerId: 'volunteer-speaker',
    },
    video, context: null, busy: false, setConnected: vi.fn(), setError: vi.fn(),
    primeAudio: vi.fn(), request: vi.fn(), end: vi.fn(),
  } as unknown as CallController
}
const camera = (identity: string, isLocal: boolean) => ({ participant: { identity, isLocal }, publication: { isMuted: false } })
beforeEach(() => { media.tracks = []; media.room = {} })

describe('incident call camera direction', () => {
  it('publishes only supervisor audio and displays the identified volunteer camera', () => {
    media.tracks = [camera('supervisor-speaker', true), camera('another-peer', false), camera('volunteer-speaker', false)]
    const html = renderToStaticMarkup(<IncidentCallMedia controller={controller(false)} />)
    expect(media.room).toMatchObject({ audio: true, video: false })
    expect(html).toContain('data-owner="volunteer-speaker"')
    expect(html).not.toContain('data-owner="supervisor-speaker"')
    expect(html).not.toContain('data-owner="another-peer"')
    expect(html).toContain('Sari’s camera')
    expect(html).not.toContain('Flip camera')
  })

  it('starts the volunteer rear camera on join and previews the volunteer feed', () => {
    media.tracks = [camera('supervisor-speaker', false), camera('volunteer-speaker', true)]
    const html = renderToStaticMarkup(<IncidentCallMedia volunteer controller={controller(true)} />)
    expect(media.room).toMatchObject({ audio: true, video: { facingMode: 'environment' } })
    expect(html).toContain('data-owner="volunteer-speaker"')
    expect(html).not.toContain('data-owner="supervisor-speaker"')
    expect(html).toContain('Your camera')
    expect(html).toContain('Flip camera')
  })

  it('shows camera-off when the expected volunteer track has not arrived', () => {
    media.tracks = [camera('supervisor-speaker', true), camera('another-peer', false)]
    const html = renderToStaticMarkup(<IncidentCallMedia controller={controller(false)} />)
    expect(html).toContain('Camera is off')
    expect(html).not.toContain('<video')
  })

  it('honors a volunteer joining by code in audio-only mode', () => {
    renderToStaticMarkup(<IncidentCallMedia volunteer controller={controller(true, false)} />)
    expect(media.room).toMatchObject({ audio: true, video: false })
  })

  it('keeps role-based rendering compatible with the previous API during rollout', () => {
    const call = controller(false)
    delete call.credentials!.volunteerSpeakerId
    media.tracks = [camera('supervisor-speaker', true), camera('volunteer-speaker', false)]
    const html = renderToStaticMarkup(<IncidentCallMedia controller={call} />)
    expect(html).toContain('data-owner="volunteer-speaker"')
    expect(html).not.toContain('data-owner="supervisor-speaker"')
  })
})

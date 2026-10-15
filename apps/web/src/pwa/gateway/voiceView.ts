import type { PermState } from '../permissions/usePermissions'
import type { SessionState } from './pttSession'
import type { VoiceAvailability } from './voiceAvailability'
import { voiceStrings, type VoiceLeaf } from './voiceStrings'

export type TalkButton = 'checking' | 'ready' | 'connecting' | 'listening' | 'replying' | 'unavailable'

export interface TalkView {
  button: TalkButton
  label: VoiceLeaf
  status: VoiceLeaf
  disabled: boolean
}

export interface TalkInput {
  voice: VoiceAvailability
  session: SessionState
  mic: PermState
  /** Set when a press itself found voice unusable (the check said ready, the press disagreed). */
  blocked: 'auth' | 'unavailable' | null
}

/** One answer for the button and the line under it, so they always agree (#74). */
export function talkView({ voice, session, mic, blocked }: TalkInput): TalkView {
  const unavailable = (status: VoiceLeaf): TalkView => ({
    button: 'unavailable',
    label: voiceStrings.button.unavailable,
    status,
    disabled: true,
  })

  if (mic === 'denied') return unavailable(voiceStrings.status.micBlocked)
  if (voice === 'signed_out' || blocked === 'auth') return unavailable(voiceStrings.status.signedOut)
  if (voice === 'unavailable' || blocked === 'unavailable' || mic === 'unsupported') return unavailable(voiceStrings.status.down)
  if (voice === 'checking') {
    return { button: 'checking', label: voiceStrings.button.checking, status: voiceStrings.status.checking, disabled: true }
  }

  switch (session) {
    case 'connecting':
      return { button: 'connecting', label: voiceStrings.button.connecting, status: voiceStrings.status.connecting, disabled: false }
    case 'live':
      return { button: 'listening', label: voiceStrings.button.listening, status: voiceStrings.status.listening, disabled: false }
    case 'waiting':
      return { button: 'replying', label: voiceStrings.button.replying, status: voiceStrings.status.replying, disabled: false }
    case 'lost':
      return { button: 'ready', label: voiceStrings.button.ready, status: voiceStrings.status.lost, disabled: false }
    default:
      return { button: 'ready', label: voiceStrings.button.ready, status: voiceStrings.status.ready, disabled: false }
  }
}

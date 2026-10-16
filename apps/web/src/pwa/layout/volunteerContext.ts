import { createContext, useContext } from 'react'

import type { Me } from '../../auth/api'
import type { EmberApi } from '../api/types'
import type { MockControls } from '../api/mock'
import type { Digest } from '../contracts/types'
import type { CoachPhase } from '../gateway/CoachReply'
import type { TalkView } from '../gateway/voiceView'
import type { OutboxHandle } from '../outbox/useOutbox'
import type { UploadFn } from '../photo/upload'
import type { Asking, PermKey, Perms } from '../permissions/usePermissions'
import type { DigestStatus } from '../useDigest'

export interface CoachState {
  phase: CoachPhase
  replyText: string | null
  receivedAt: string | null
  incidentLabel: string | null
}

export interface TalkHandle {
  view: TalkView
  onPress: () => void
  onRelease: () => void
  /** Live transcript from the gateway while holding, or null when none was sent (#129). */
  transcript: string | null
  /** Take and clear the last transcript so release can POST /observations once. */
  takeTranscript: () => string | null
  coach: CoachState
  /**
   * After a spoken report is stored, show the coach panel (#130).
   * Pass receipt fields only when the API or gateway already provided them.
   */
  beginCoach: (receipt?: { receivedAt?: string | null; incidentLabel?: string | null }) => void
}

/**
 * Everything the volunteer screens share. One provider (VolunteerProvider) builds it, so the
 * digest is polled once and the outbox, permissions and voice session exist once, however many
 * tabs read them.
 */
export interface VolunteerValue {
  api: EmberApi
  me: Me | null
  volunteerId: string | null
  digest: Digest | null
  digestStatus: DigestStatus
  /** Phone time of the last successful digest read, or null before the first. */
  lastSyncAt: string | null
  refresh: () => void
  outbox: OutboxHandle
  upload: UploadFn
  perms: Perms
  asking: Asking
  requestPermission: (key: PermKey) => void
  talk: TalkHandle
  mock: MockControls | undefined
}

export const VolunteerContext = createContext<VolunteerValue | null>(null)

export function useVolunteer(): VolunteerValue {
  const value = useContext(VolunteerContext)
  if (!value) throw new Error('useVolunteer needs a VolunteerProvider above it')
  return value
}

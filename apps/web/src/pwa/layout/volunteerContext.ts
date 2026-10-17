import { createContext, useContext } from 'react'

import type { Me } from '../../auth/api'
import type { EmberApi } from '../api/types'
import type { MockControls } from '../api/mock'
import type { Digest } from '../contracts/types'
import type { TalkView } from '../gateway/voiceView'
import type { OutboxHandle } from '../outbox/useOutbox'
import type { DevicePosition } from '../screens/arrival'
import type { UploadFn } from '../photo/upload'
import type { Asking, PermKey, Perms } from '../permissions/usePermissions'
import type { DigestStatus } from '../useDigest'

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
  /** The phone's position while location is allowed. It goes on the digest read and is never stored. */
  position: DevicePosition
  outbox: OutboxHandle
  upload: UploadFn
  perms: Perms
  asking: Asking
  requestPermission: (key: PermKey) => void
  talk: { view: TalkView; onPress: () => void; onRelease: () => void }
  mock: MockControls | undefined
}

export const VolunteerContext = createContext<VolunteerValue | null>(null)

export function useVolunteer(): VolunteerValue {
  const value = useContext(VolunteerContext)
  if (!value) throw new Error('useVolunteer needs a VolunteerProvider above it')
  return value
}

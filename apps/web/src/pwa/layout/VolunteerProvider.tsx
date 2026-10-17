import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useAuth } from '../../auth/AuthProvider'
import { authHeadersFor } from '../api/authHeaders'
import { createHttpApi } from '../api/client'
import { GATEWAY_WSS_URL, USE_MOCK_API } from '../api/config'
import { createMockApi, type MockControls } from '../api/mock'
import { reportAuthFailures } from '../api/reportAuthFailures'
import type { EmberApi } from '../api/types'
import { recordDigestClock } from '../clock'
import { browserSocketFactory, PttSession, type SessionState } from '../gateway/pttSession'
import { useVoiceAvailability } from '../gateway/useVoiceAvailability'
import { talkView } from '../gateway/voiceView'
import { registerServiceWorker } from '../install/registerServiceWorker'
import { useOutbox } from '../outbox/useOutbox'
import { usePermissions } from '../permissions/usePermissions'
import { createMockUpload, createXhrUpload } from '../photo/upload'
import { usePushRegistration } from '../push/usePushRegistration'
import { useDevicePosition } from '../screens/useDevicePosition'
import { useDigest } from '../useDigest'
import { VolunteerContext, type VolunteerValue } from './volunteerContext'

/**
 * The one provider for every signed-in volunteer screen (#121). It owns the digest poll, the
 * outbox, the permission state and the push-to-talk session, so each tab reads them instead of
 * starting its own. Render it inside RequireRole role="volunteer", where `me` is set.
 */
export function VolunteerProvider({ api: apiOverride, children }: { api?: EmberApi; children: ReactNode }) {
  const { user, me, reportAuthFailure } = useAuth()
  const [session, setSession] = useState<SessionState>('idle')
  const [pttBlocked, setPttBlocked] = useState<'auth' | 'unavailable' | null>(null)
  const { perms, asking, request } = usePermissions()
  const getAuthHeaders = useMemo(() => authHeadersFor(user), [user])
  const volunteerId = me?.id ?? null
  const baseApi = useMemo<EmberApi>(
    () => apiOverride ?? (USE_MOCK_API ? createMockApi(volunteerId ?? 'uid_mock') : createHttpApi(getAuthHeaders)),
    [apiOverride, getAuthHeaders, volunteerId],
  )
  // A 401 on any call swaps the page for the sign-in screen (session expired, or device not verified).
  const api = useMemo<EmberApi>(
    () => (reportAuthFailure ? reportAuthFailures(baseApi, reportAuthFailure) : baseApi),
    [baseApi, reportAuthFailure],
  )
  const mock = (baseApi as EmberApi & { mock?: MockControls }).mock
  const upload = useMemo(() => (USE_MOCK_API ? createMockUpload() : createXhrUpload()), [])
  const outbox = useOutbox(api, upload)

  useEffect(() => registerServiceWorker(), [])

  // The fix rides on the digest read so the home screen can list fires near the phone. Only while location is allowed.
  const position = useDevicePosition(perms.location === 'granted')
  const digestPosition = useMemo(() => (position.kind === 'ok' ? { lat: position.lat, lng: position.lng } : null), [position])
  const { digest, status: digestStatus, lastSyncAt, refresh } = useDigest(api, recordDigestClock, digestPosition)
  usePushRegistration(user, perms.notifications, refresh)

  const ptt = useMemo(
    () => new PttSession({ url: GATEWAY_WSS_URL, getAuthHeaders, createSocket: browserSocketFactory, onState: setSession }),
    [getAuthHeaders],
  )
  useEffect(() => () => ptt.close(), [ptt])
  const voice = useVoiceAvailability({ url: GATEWAY_WSS_URL, getAuthHeaders, createSocket: browserSocketFactory })
  const pressed = useRef(false)

  const onPress = async () => {
    pressed.current = true
    const result = await ptt.press()
    if (result === 'opened') {
      setPttBlocked(null)
      if (!pressed.current) ptt.release()
    } else {
      setPttBlocked(result === 'signed_out' ? 'auth' : 'unavailable')
    }
  }
  const onRelease = () => {
    pressed.current = false
    if (ptt.isOpen) ptt.release()
  }

  const view = talkView({ voice, session, mic: perms.microphone, blocked: pttBlocked })
  const value: VolunteerValue = {
    api,
    me,
    volunteerId,
    digest,
    digestStatus,
    lastSyncAt,
    refresh,
    position,
    outbox,
    upload,
    perms,
    asking,
    requestPermission: (key) => void request(key),
    talk: { view, onPress: () => void onPress(), onRelease },
    mock,
  }
  return <VolunteerContext.Provider value={value}>{children}</VolunteerContext.Provider>
}

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'

import { useAuth } from '../../auth/AuthProvider'
import { authHeadersFor } from '../api/authHeaders'
import { createHttpApi } from '../api/client'
import { GATEWAY_WSS_URL, USE_MOCK_API } from '../api/config'
import { createMockApi, type MockControls } from '../api/mock'
import { reportAuthFailures } from '../api/reportAuthFailures'
import type { EmberApi } from '../api/types'
import { recordDigestClock } from '../clock'
import type { CoachState } from './volunteerContext'
import { browserSocketFactory, PttSession, type SessionState } from '../gateway/pttSession'
import { coachReceiptOf, coachTextOf, transcriptOf } from '../gateway/transcript'
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
import { LanguageContext, useLanguage } from '../language'
import { createProfileSettings } from './profileSettings'

const IDLE_COACH: CoachState = { phase: 'idle', replyText: null, receivedAt: null, incidentLabel: null }

/**
 * The one provider for every signed-in volunteer screen (#121). It owns the digest poll, the
 * outbox, the permission state and the push-to-talk session, so each tab reads them instead of
 * starting its own. Render it inside RequireRole role="volunteer", where `me` is set.
 */
export function VolunteerProvider({ api: apiOverride, children }: { api?: EmberApi; children: ReactNode }) {
  const { user, me, reportAuthFailure } = useAuth()
  const language = useLanguage()
  const initialLanguage = useRef(language.language)
  const [session, setSession] = useState<SessionState>('idle')
  const [pttBlocked, setPttBlocked] = useState<'auth' | 'unavailable' | null>(null)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [coach, setCoach] = useState<CoachState>(IDLE_COACH)
  const transcriptRef = useRef<string | null>(null)
  const { perms, asking, request } = usePermissions()
  const getAuthHeaders = useMemo(() => authHeadersFor(user), [user])
  const volunteerId = me?.id ?? null
  const baseApi = useMemo<EmberApi>(
    () => apiOverride ?? (USE_MOCK_API ? createMockApi(volunteerId ?? 'uid_mock', 300, me ?? undefined, { incidentFlow: true }) : createHttpApi(getAuthHeaders)),
    [apiOverride, getAuthHeaders, volunteerId, me],
  )
  // A 401 on any call swaps the page for the sign-in screen (session expired, or device not verified).
  const api = useMemo<EmberApi>(
    () => (reportAuthFailure ? reportAuthFailures(baseApi, reportAuthFailure) : baseApi),
    [baseApi, reportAuthFailure],
  )
  const mock = (baseApi as EmberApi & { mock?: MockControls }).mock
  const settings = useMemo(() => createProfileSettings(me, api, initialLanguage.current, language.setLang), [me, api, language.setLang])
  useEffect(() => settings.connect(), [settings])
  const profile = useSyncExternalStore(settings.subscribe, settings.get, settings.get)
  const upload = useMemo(() => (USE_MOCK_API ? createMockUpload() : createXhrUpload()), [])
  const outbox = useOutbox(api, upload)

  useEffect(() => registerServiceWorker(), [])

  // The fix rides on the digest read so the home screen can list fires near the phone. Only while location is allowed.
  const position = useDevicePosition(perms.location === 'granted')
  const digestPosition = useMemo(() => (position.kind === 'ok' ? { lat: position.lat, lng: position.lng } : null), [position])
  const { digest, status: digestStatus, lastSyncAt, refresh } = useDigest(api, recordDigestClock, digestPosition)
  usePushRegistration(user, perms.notifications, refresh)

  const ptt = useMemo(
    () =>
      new PttSession({
        url: GATEWAY_WSS_URL,
        getAuthHeaders,
        createSocket: browserSocketFactory,
        onState: setSession,
        onMessage: (msg) => {
          const line = transcriptOf(msg)
          if (line) {
            transcriptRef.current = line
            setTranscript(line)
          }
          const reply = coachTextOf(msg)
          if (reply) {
            const receipt = coachReceiptOf(msg)
            setCoach((prev) => ({
              ...prev,
              phase: 'done',
              replyText: reply,
              receivedAt: receipt.receivedAt ?? prev.receivedAt,
              incidentLabel: receipt.incidentLabel ?? prev.incidentLabel,
            }))
          }
        },
      }),
    [getAuthHeaders],
  )
  useEffect(() => () => ptt.close(), [ptt])
  const voice = useVoiceAvailability({ url: GATEWAY_WSS_URL, getAuthHeaders, createSocket: browserSocketFactory })
  const pressed = useRef(false)

  const onPress = async () => {
    pressed.current = true
    transcriptRef.current = null
    setTranscript(null)
    setCoach(IDLE_COACH)
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
    me: profile.me,
    updateMe: settings.update,
    settingsSaving: profile.saving,
    settingsError: profile.error,
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
    talk: {
      view,
      onPress: () => void onPress(),
      onRelease,
      transcript,
      takeTranscript: () => {
        const text = transcriptRef.current
        transcriptRef.current = null
        setTranscript(null)
        return text
      },
      coach,
      beginCoach: (receipt) => {
        setCoach({
          phase: 'replying',
          replyText: null,
          receivedAt: receipt?.receivedAt ?? null,
          incidentLabel: receipt?.incidentLabel ?? null,
        })
      },
    },
    mock,
  }
  return (
    <LanguageContext.Provider value={{ ...language, setLang: (next) => settings.update({ language: next }) }}>
      <VolunteerContext.Provider value={value}>{children}</VolunteerContext.Provider>
    </LanguageContext.Provider>
  )
}

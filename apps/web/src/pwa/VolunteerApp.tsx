import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import type { ChipValue } from './contracts/types'
import { authHeadersFor } from './api/authHeaders'
import { createHttpApi } from './api/client'
import { GATEWAY_WSS_URL, USE_MOCK_API } from './api/config'
import type { EmberApi } from './api/types'
import { createMockApi, type MockControls } from './api/mock'
import { activeWithdraw, currentTask } from './digest'
import { recordDigestClock } from './clock'
import { useDigest } from './useDigest'
import { incidentLabelById } from './incidentName'
import { browserSocketFactory, PttSession, type SessionState } from './gateway/pttSession'
import { TalkCard } from './gateway/TalkCard'
import { useVoiceAvailability } from './gateway/useVoiceAvailability'
import { talkView } from './gateway/voiceView'
import { registerServiceWorker } from './install/registerServiceWorker'
import { usePushRegistration } from './push/usePushRegistration'
import { strings, t } from './i18n'
import { useLanguage } from './language'
import { usePermissions } from './permissions/usePermissions'
import { useMarkHeard } from './useMarkHeard'
import { PermissionsPanel } from './install/PermissionsPanel'
import { InstallBanner } from './install/InstallBanner'
import { ReportPanel } from './report/ReportPanel'
import { PhotoPanel } from './photo/PhotoPanel'
import { createMockUpload, createXhrUpload } from './photo/upload'
import { OutboxPanel } from './outbox/OutboxPanel'
import { useOutbox } from './outbox/useOutbox'
import { getPosition, locate, watchLocationGranted } from './report/location'
import { VolunteerHeader } from './VolunteerHeader'
import { WithdrawScreen } from './WithdrawScreen'
import './volunteer.css'

/** Volunteer screen at /pwa. Rendered inside RequireRole role="volunteer", so `me` is set. */
export function VolunteerApp({ api: apiOverride }: { api?: EmberApi }) {
  const { user, me } = useAuth()
  const { lang } = useLanguage()
  const [session, setSession] = useState<SessionState>('idle')
  const [pttBlocked, setPttBlocked] = useState<'auth' | 'unavailable' | null>(null)
  const { perms, asking, request } = usePermissions()
  const getAuthHeaders = useMemo(() => authHeadersFor(user), [user])
  const volunteerId = me?.id ?? null
  const api = useMemo<EmberApi>(
    () => apiOverride ?? (USE_MOCK_API ? createMockApi(volunteerId ?? 'uid_mock') : createHttpApi(getAuthHeaders)),
    [apiOverride, getAuthHeaders, volunteerId],
  )
  const mock = (api as EmberApi & { mock?: MockControls }).mock
  const upload = useMemo(() => (USE_MOCK_API ? createMockUpload() : createXhrUpload()), [])
  const outbox = useOutbox(api, upload)

  useEffect(() => registerServiceWorker(), [])

  const { digest, status: digestStatus, refresh: load } = useDigest(api, recordDigestClock)

  usePushRegistration(user, perms.notifications, load)

  const ptt = useMemo(
    () =>
      new PttSession({
        url: GATEWAY_WSS_URL,
        getAuthHeaders,
        createSocket: browserSocketFactory,
        onState: setSession,
      }),
    [getAuthHeaders],
  )
  useEffect(() => () => ptt.close(), [ptt])
  const voice = useVoiceAvailability({ url: GATEWAY_WSS_URL, getAuthHeaders, createSocket: browserSocketFactory })
  const pressed = useRef(false)

  const onPressTalk = async () => {
    pressed.current = true
    const result = await ptt.press()
    if (result === 'opened') {
      setPttBlocked(null)
      if (!pressed.current) ptt.release()
    } else {
      setPttBlocked(result === 'signed_out' ? 'auth' : 'unavailable')
    }
  }
  const onReleaseTalk = () => {
    pressed.current = false
    if (ptt.isOpen) ptt.release()
  }

  const [preset, setPreset] = useState<{ chip: ChipValue | null; n: number }>({ chip: null, n: 0 })
  /** Volunteers report what they see; only the supervisor verifies an incident. */
  const focusReport = (chip: ChipValue | null) => {
    setPreset((p) => ({ chip, n: p.n + 1 }))
    document.getElementById('quick-report-label')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const task = currentTask(digest)
  const withdrawOrder = activeWithdraw(digest, volunteerId)
  const withdraw = withdrawOrder !== null || task?.type === 'withdraw'
  const withdrawText = withdrawOrder?.instruction ?? (task?.type === 'withdraw' ? task.instruction : null)
  useMarkHeard(api, digest, task?.id ?? null, withdraw)

  return (
    <div className="vol">
      <VolunteerHeader name={me?.displayName} lang={lang} />

      <main className="vol-main">
        <p className="badge-simulated vol-simulated">{t(lang, strings.simulated)}</p>
        <InstallBanner lang={lang} />

        {!digest && digestStatus === 'loading' && (
          <p className="card muted" role="status">
            {t(lang, strings.loading)}
          </p>
        )}
        {(digestStatus === 'unreachable' || digestStatus === 'refused') && (
          <div className="card error-card" role="alert">
            <p>{t(lang, digestStatus === 'refused' ? strings.loadRefused : strings.loadError)}</p>
            <button type="button" className="btn secondary" onClick={load}>
              {t(lang, strings.retry)}
            </button>
          </div>
        )}

        {digest && !task && (
          <section className="card">
            <h2>{t(lang, strings.noTask)}</h2>
            <p className="muted">{t(lang, strings.noTaskHint)}</p>
          </section>
        )}

        {task && !withdraw && (
          <section className="card task" aria-labelledby="task-title">
            <p className="section-label">{t(lang, strings.currentTask)}</p>
            <h2 id="task-title">
              {t(lang, strings.taskType[task.type])} · {incidentLabelById(task.incidentId, digest?.incidents)}
            </h2>
            <p className="muted">{t(lang, strings.taskStatus[task.status])}</p>
            {task.instruction && <p className="instruction">{task.instruction}</p>}
            <p className="tip">{t(lang, strings.safeTip)}</p>
            {task.type === 'verify' && (
              <div className="task-actions">
                <button type="button" className="btn primary" onClick={() => focusReport(null)}>
                  {t(lang, strings.sendAsReport)}
                </button>
                <button type="button" className="btn secondary" onClick={() => focusReport('aman')}>
                  {t(lang, strings.notAFire)}
                </button>
              </div>
            )}
          </section>
        )}

        <TalkCard
          lang={lang}
          view={talkView({ voice, session, mic: perms.microphone, blocked: pttBlocked })}
          onPress={() => void onPressTalk()}
          onRelease={onReleaseTalk}
        />

        <ReportPanel
          api={api}
          lang={lang}
          locate={locate}
          onLocationGranted={watchLocationGranted}
          preset={preset}
          submit={outbox.submit}
        />

        <PhotoPanel
          api={api}
          upload={upload}
          lang={lang}
          getPosition={getPosition}
          submit={outbox.submit}
          queuePhoto={outbox.queuePhoto}
        />

        <OutboxPanel
          items={outbox.items}
          online={outbox.online}
          lang={lang}
          onRetry={(id) => void outbox.retry(id)}
          onDiscard={(id) => void outbox.discard(id)}
          onSendNow={() => void outbox.flush()}
        />

        <PermissionsPanel perms={perms} asking={asking} lang={lang} onRequest={(k) => void request(k)} />

        {USE_MOCK_API && mock && (
          <section className="card dev" aria-label="Mock controls">
            <p className="section-label">MOCK API · DEV ONLY</p>
            <button type="button" className="btn small" onClick={() => { mock.triggerWithdraw(); load() }}>
              Simulate backend WITHDRAW rule
            </button>
            <button type="button" className="btn small" onClick={() => mock.failNext('network')}>
              Fail next send (network)
            </button>
            <button type="button" className="btn small" onClick={() => mock.failNext('validation')}>
              Fail next send (400)
            </button>
            <button type="button" className="btn small" onClick={() => { mock.reset(); load() }}>
              Reset
            </button>
          </section>
        )}
      </main>

      {withdraw && <WithdrawScreen instruction={withdrawText} lang={lang} />}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import type { ChipValue, Digest } from './contracts/types'
import { authHeadersFor } from './api/authHeaders'
import { createHttpApi } from './api/client'
import { GATEWAY_WSS_URL, USE_MOCK_API } from './api/config'
import { ApiError, type EmberApi } from './api/types'
import { createMockApi, type MockControls } from './api/mock'
import { activeWithdraw, currentTask } from './digest'
import { browserSocketFactory, PttSession, type SessionState } from './gateway/pttSession'
import { registerServiceWorker } from './install/registerServiceWorker'
import { usePushRegistration } from './push/usePushRegistration'
import { strings, t } from './i18n'
import { useLanguage } from './language'
import { usePermissions } from './permissions/usePermissions'
import { PermissionsPanel } from './install/PermissionsPanel'
import { InstallBanner } from './install/InstallBanner'
import { ReportPanel } from './report/ReportPanel'
import { PhotoPanel } from './photo/PhotoPanel'
import { createMockUpload, createXhrUpload } from './photo/upload'
import { OutboxPanel } from './outbox/OutboxPanel'
import { useOutbox } from './outbox/useOutbox'
import type { Position } from './report/buildObservation'
import { WithdrawScreen } from './WithdrawScreen'
import './volunteer.css'

const POLL_MS = 5000

function getPosition(): Promise<Position | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    ),
  )
}

/** Volunteer screen at /pwa. Rendered inside RequireRole role="volunteer", so `me` is set. */
export function VolunteerApp({ api: apiOverride }: { api?: EmberApi }) {
  const { user, me } = useAuth()
  const { lang, setLang } = useLanguage()
  const [digest, setDigest] = useState<Digest | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [session, setSession] = useState<SessionState>('idle')
  const [pttBlocked, setPttBlocked] = useState<'auth' | 'unavailable' | null>(null)
  const { perms, request } = usePermissions()
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

  const load = useCallback(async () => {
    try {
      setDigest(await api.getDigest())
      setLoadError(false)
    } catch (e) {
      if (!(e instanceof ApiError) || e.retryable) setLoadError(true)
    }
  }, [api])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(id)
  }, [load])

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

  return (
    <div className="vol">
      <header className="vol-header">
        <img src="/brand/ember-emblem.svg" alt="" width={28} height={28} />
        <div className="vol-title">
          <strong>EMBER</strong>
          <span className="muted">{me?.displayName ? `${me.displayName} · ${t(lang, strings.team)}` : t(lang, strings.team)}</span>
        </div>
        <span className="badge-simulated">{t(lang, strings.simulated)}</span>
        <button
          type="button"
          className="lang"
          aria-label={t(lang, strings.langToggleLabel)}
          onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
        >
          {t(lang, strings.langToggle)}
        </button>
      </header>

      <main className="vol-main">
        <InstallBanner lang={lang} />

        {!digest && !loadError && (
          <p className="card muted" role="status">
            {t(lang, strings.loading)}
          </p>
        )}
        {loadError && (
          <div className="card error-card" role="alert">
            <p>{t(lang, strings.loadError)}</p>
            <button type="button" className="btn secondary" onClick={() => void load()}>
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
              {t(lang, strings.taskType[task.type])} · {task.incidentId}
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

        <section className="card talk">
          <div className="camera-state" data-state={perms.camera}>
            {t(lang, strings.camera)}: {t(lang, strings.perm[perms.camera])}
          </div>
          <p className="session" aria-live="polite">
            {t(lang, strings.session[session])}
          </p>
          <button
            type="button"
            className="btn ink ptt"
            disabled={perms.microphone === 'denied' || perms.microphone === 'unsupported'}
            onPointerDown={() => void onPressTalk()}
            onPointerUp={onReleaseTalk}
            onPointerLeave={onReleaseTalk}
            onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && void onPressTalk()}
            onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && onReleaseTalk()}
          >
            🎙 {t(lang, strings.holdToTalk)}
          </button>
          {perms.microphone === 'denied' && <p className="error">{t(lang, strings.microphone)}: {t(lang, strings.permDeniedHelp)}</p>}
          {pttBlocked && (
            <p className="muted" role="status">
              {t(lang, pttBlocked === 'auth' ? strings.talkNeedsSignIn : strings.talkUnavailable)}
            </p>
          )}
        </section>

        <ReportPanel api={api} lang={lang} getPosition={getPosition} preset={preset} submit={outbox.submit} />

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

        <PermissionsPanel perms={perms} lang={lang} onRequest={(k) => void request(k)} />

        {USE_MOCK_API && mock && (
          <section className="card dev" aria-label="Mock controls">
            <p className="section-label">MOCK API · DEV ONLY</p>
            <button type="button" className="btn small" onClick={() => { mock.triggerWithdraw(); void load() }}>
              Simulate backend WITHDRAW rule
            </button>
            <button type="button" className="btn small" onClick={() => mock.failNext('network')}>
              Fail next send (network)
            </button>
            <button type="button" className="btn small" onClick={() => mock.failNext('validation')}>
              Fail next send (400)
            </button>
            <button type="button" className="btn small" onClick={() => { mock.reset(); void load() }}>
              Reset
            </button>
          </section>
        )}
      </main>

      {withdraw && <WithdrawScreen instruction={withdrawText} lang={lang} />}
    </div>
  )
}

import { Navigate, Route, Routes } from 'react-router-dom'

import { InstallBanner } from '../install/InstallBanner'
import { DigestNotice } from '../DigestNotice'
import { currentTask } from '../digest'
import { strings, t } from '../i18n'
import { useLanguage } from '../language'
import { FlagReportScreen } from '../screens/FlagReportScreen'
import { GuideScreen } from '../screens/GuideScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { IncidentDetailScreen } from '../screens/IncidentDetailScreen'
import { IncidentsScreen } from '../screens/IncidentsScreen'
import { ProfileScreen } from '../screens/ProfileScreen'
import { ReportScreen } from '../screens/ReportScreen'
import { DeclineScreen } from '../screens/DeclineScreen'
import { NotAFireScreen } from '../screens/NotAFireScreen'
import { SmsScreen } from '../screens/SmsScreen'
import { TaskScreen } from '../screens/TaskScreen'
import { usePushNavigation } from '../push/usePushNavigation'
import { useMarkHeard } from '../useMarkHeard'
import { useWakeLock } from '../useWakeLock'
import { VolunteerHeader } from '../VolunteerHeader'
import { WithdrawScreen } from '../WithdrawScreen'
import { WithdrawCleared } from '../screens/WithdrawViews'
import { useWithdrawFlow } from '../withdraw/useWithdrawFlow'
import { USE_MOCK_API } from '../api/config'
import { TabBar } from './TabBar'
import { useVolunteer } from './volunteerContext'

/**
 * The phone layout (#121): header, the content area and the bottom tabs. Only the content area changes between
 * screens. WITHDRAW is drawn over all of it, tabs included, so the volunteer cannot tab away from it.
 */
export function PhoneLayout() {
  const { lang } = useLanguage()
  const v = useVolunteer()
  const { api, me, volunteerId, digest, digestStatus, lastSyncAt, refresh, outbox, mock } = v

  const task = currentTask(digest)
  usePushNavigation()
  const flow = useWithdrawFlow({ api, digest, volunteerId, task })
  const withdraw = flow.active !== null
  useMarkHeard(api, digest, task?.id ?? null, withdraw)
  // A locked screen would hide the one instruction that matters, so it stays on while WITHDRAW is showing.
  useWakeLock(withdraw)

  return (
    <div className="vol">
      <VolunteerHeader name={me?.displayName} crew={me?.crewName} lang={lang} />

      <main className="vol-main">
        <p className="badge-simulated vol-simulated">{t(lang, strings.simulated)}</p>
        <InstallBanner lang={lang} />
        <DigestNotice status={digestStatus} hasDigest={digest !== null} lang={lang} onRetry={refresh} />

        {flow.cleared && !withdraw ? (
          <WithdrawCleared lang={lang} sentAt={flow.cleared.sentAt} reasons={flow.cleared.reasons} clearedAtMs={flow.cleared.clearedAtMs} onDismiss={flow.dismissCleared} />
        ) : (
        <Routes>
          <Route
            index
            element={
              <HomeScreen
                lang={lang}
                digest={digest}
                status={digestStatus}
                lastSyncAt={lastSyncAt}
                online={outbox.online}
                queuedCount={outbox.items.length}
                queued={outbox.items}
              />
            }
          />
          <Route path="report" element={<ReportScreen />} />
          <Route path="incidents" element={<IncidentsScreen />} />
          <Route path="incidents/:id" element={<IncidentDetailScreen />} />
          <Route path="incidents/:id/flag/:obsId" element={<FlagReportScreen />} />
          <Route path="task/:id" element={<TaskScreen />} />
          <Route path="task/:id/decline" element={<DeclineScreen />} />
          <Route path="task/:id/not-a-fire" element={<NotAFireScreen />} />
          <Route path="sms" element={<SmsScreen />} />
          <Route path="guide" element={<GuideScreen />} />
          <Route path="profile" element={<ProfileScreen />} />
          <Route path="*" element={<Navigate to="/pwa" replace />} />
        </Routes>
        )}

        {USE_MOCK_API && mock && (
          <section className="card dev" aria-label="Mock controls">
            <p className="section-label">MOCK API · DEV ONLY</p>
            <button type="button" className="btn small" onClick={() => { mock.triggerWithdraw(); refresh() }}>
              Simulate backend WITHDRAW rule
            </button>
            <button type="button" className="btn small" onClick={() => { mock.clearWithdraw(); refresh() }}>
              Simulate WITHDRAW lifted
            </button>
            <button type="button" className="btn small" onClick={() => mock.failNext('network')}>
              Fail next send (network)
            </button>
            <button type="button" className="btn small" onClick={() => mock.failNext('validation')}>
              Fail next send (400)
            </button>
            <button type="button" className="btn small" onClick={() => { mock.reset(); refresh() }}>
              Reset
            </button>
          </section>
        )}
      </main>

      <TabBar lang={lang} />
      {withdraw && <WithdrawScreen lang={lang} flow={flow} />}
    </div>
  )
}

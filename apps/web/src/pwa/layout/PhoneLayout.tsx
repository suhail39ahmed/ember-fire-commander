import { Navigate, Route, Routes, useMatch } from 'react-router-dom'

import { InstallBanner } from '../install/InstallBanner'
import { DigestNotice } from '../DigestNotice'
import { currentTask } from '../digest'
import { strings, t } from '../i18n'
import { useLanguage } from '../language'
import { FlagReportScreen } from '../screens/FlagReportScreen'
import { GuideScreen } from '../screens/GuideScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { ApprovedJoinedScreen, DirectJoinedScreen } from '../screens/JoinedScreen'
import { PracticeScreen } from '../screens/PracticeScreen'
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
  const profileRoute = useMatch('/pwa/profile') !== null
  const smsRoute = useMatch('/pwa/sms') !== null
  const homeRoute = useMatch('/pwa') !== null
  const v = useVolunteer()
  const { api, me, volunteerId, digest, digestStatus, lastSyncAt, refresh, position, outbox, mock } = v
  const dataOnline = outbox.online && digestStatus !== 'unreachable'

  const task = currentTask(digest)
  usePushNavigation()
  const flow = useWithdrawFlow({ api, digest, volunteerId, task })
  const withdraw = flow.active !== null
  useMarkHeard(api, digest, task?.id ?? null, withdraw)
  // A locked screen would hide the one instruction that matters, so it stays on while WITHDRAW is showing.
  useWakeLock(withdraw)

  return (
    <div className="vol">
      <div className="vol-background" aria-hidden={withdraw || undefined} ref={(element) => { if (element) element.inert = withdraw }}>
      {!profileRoute && <VolunteerHeader name={me?.displayName} crew={me?.crewName} lang={lang} />}

      <main className={`vol-main${smsRoute || (homeRoute && !dataOnline) ? ' vol-main-field' : ''}`}>
        {!profileRoute && !smsRoute && !(homeRoute && !dataOnline) && <p className="badge-simulated vol-simulated">{t(lang, strings.simulated)}</p>}
        <InstallBanner lang={lang} />
        {outbox.online && !(homeRoute && !dataOnline) && !smsRoute && <DigestNotice status={digestStatus} hasDigest={digest !== null} lang={lang} onRetry={refresh} />}

        {flow.cleared && !withdraw ? (
          <WithdrawCleared lang={lang} sentAt={flow.cleared.sentAt} reasons={flow.cleared.reasons} clearedAtMs={flow.cleared.clearedAtMs} clearedByName={flow.cleared.clearedByName} clearReason={flow.cleared.clearReason} onDismiss={flow.dismissCleared} />
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
                online={dataOnline}
                queuedCount={outbox.items.length}
                queued={outbox.items}
                outboxActions={outbox}
                api={api}
                volunteerId={volunteerId}
                onRefresh={refresh}
                position={position}
              />
            }
          />
          <Route path="report" element={<ReportScreen />} />
          <Route path="joined/:id" element={<DirectJoinedScreen />} />
          <Route path="incidents" element={<IncidentsScreen />} />
          <Route path="incidents/:id" element={<IncidentDetailScreen />} />
          <Route path="incidents/:id/joined" element={<ApprovedJoinedScreen />} />
          <Route path="incidents/:id/flag/:obsId" element={<FlagReportScreen />} />
          <Route path="task/:id" element={<TaskScreen />} />
          <Route path="task/:id/decline" element={<DeclineScreen />} />
          <Route path="task/:id/not-a-fire" element={<NotAFireScreen />} />
          <Route path="sms" element={<SmsScreen />} />
          <Route path="guide" element={<GuideScreen />} />
          <Route path="guide/practice" element={<PracticeScreen />} />
          <Route path="profile" element={<ProfileScreen />} />
          <Route path="*" element={<Navigate to="/pwa" replace />} />
        </Routes>
        )}

        {!profileRoute && USE_MOCK_API && mock && (
          <section className="card dev" aria-label="Mock controls">
            <p className="section-label">MOCK API · DEV ONLY</p>
            <button type="button" className="btn small" onClick={() => { mock.triggerWithdraw(); refresh() }}>
              Simulate backend WITHDRAW rule
            </button>
            <button type="button" className="btn small" onClick={() => { mock.clearWithdraw(); refresh() }}>
              Simulate WITHDRAW lifted
            </button>
            <button type="button" className="btn small" onClick={() => { mock.closeLead(); refresh() }}>
              Simulate lead closed
            </button>
            {(digest?.myJoinRequests ?? []).filter((r) => r.status === 'pending').slice(0, 1).map((r) => (
              <div key={r.incidentId} className="task-actions">
                <button type="button" className="btn small" onClick={() => { mock.approveJoin(r.incidentId); refresh() }}>
                  Supervisor approves join
                </button>
                <button type="button" className="btn small" onClick={() => { mock.declineJoin(r.incidentId); refresh() }}>
                  Supervisor declines join
                </button>
              </div>
            ))}
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
      </div>
      {withdraw && <WithdrawScreen lang={lang} flow={flow} />}
    </div>
  )
}

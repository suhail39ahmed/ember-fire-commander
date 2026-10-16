import { Navigate, Route, Routes } from 'react-router-dom'

import { InstallBanner } from '../install/InstallBanner'
import { DigestNotice } from '../DigestNotice'
import { activeWithdraw, currentTask } from '../digest'
import { strings, t } from '../i18n'
import { useLanguage } from '../language'
import { GuideScreen } from '../screens/GuideScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { IncidentsScreen } from '../screens/IncidentsScreen'
import { ProfileScreen } from '../screens/ProfileScreen'
import { ReportScreen } from '../screens/ReportScreen'
import { useMarkHeard } from '../useMarkHeard'
import { useWakeLock } from '../useWakeLock'
import { VolunteerHeader } from '../VolunteerHeader'
import { WithdrawScreen } from '../WithdrawScreen'
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
  const withdrawOrder = activeWithdraw(digest, volunteerId)
  const withdraw = withdrawOrder !== null || task?.type === 'withdraw'
  const withdrawText = withdrawOrder?.instruction ?? (task?.type === 'withdraw' ? task.instruction : null)
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
              />
            }
          />
          <Route path="report" element={<ReportScreen />} />
          <Route path="incidents" element={<IncidentsScreen />} />
          <Route path="guide" element={<GuideScreen />} />
          <Route path="profile" element={<ProfileScreen />} />
          <Route path="*" element={<Navigate to="/pwa" replace />} />
        </Routes>

        {USE_MOCK_API && mock && (
          <section className="card dev" aria-label="Mock controls">
            <p className="section-label">MOCK API · DEV ONLY</p>
            <button type="button" className="btn small" onClick={() => { mock.triggerWithdraw(); refresh() }}>
              Simulate backend WITHDRAW rule
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
      {withdraw && <WithdrawScreen instruction={withdrawText} lang={lang} />}
    </div>
  )
}

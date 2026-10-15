import { Route, Routes } from 'react-router-dom'

import { lazyPage } from './lazyPage'
import { NotFound } from './NotFound'
import { PageBoundary } from './PageBoundary'
import { RoleChoice } from './RoleChoice'
import { RequireRole } from './RoleHome'

// Each signed-in page is its own chunk, fetched only after the role check passes,
// so volunteers never download the console and supervisors never download the volunteer app.
const VolunteerApp = lazyPage(() => import('../pwa/VolunteerApp').then((m) => m.VolunteerApp))
const SupervisorConsole = lazyPage(() => import('../supervisor/SupervisorConsole').then((m) => m.SupervisorConsole))

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RoleChoice />} />
      <Route
        path="/pwa"
        element={
          <RequireRole role="volunteer">
            <PageBoundary>
              <VolunteerApp />
            </PageBoundary>
          </RequireRole>
        }
      />
      <Route
        path="/console"
        element={
          <RequireRole role="supervisor">
            <PageBoundary>
              <SupervisorConsole />
            </PageBoundary>
          </RequireRole>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

import { Route, Routes } from 'react-router-dom'

import { lazyPage } from './lazyPage'
import { NotFound } from './NotFound'
import { PageBoundary } from './PageBoundary'
import { RoleChoice } from './RoleChoice'
import { RequireRole } from './RoleHome'

// Each signed-in page is its own chunk, fetched only after the role check passes,
// so volunteers never download the console and supervisors never download the volunteer app.
const VolunteerApp = lazyPage(() => import('../pwa/VolunteerApp').then((m) => m.VolunteerApp))
const ConsoleLayout = lazyPage(() => import('../supervisor/ConsoleLayout').then((m) => m.ConsoleLayout))
const IncidentsShell = lazyPage(() => import('../supervisor/SupervisorConsole').then((m) => m.IncidentsShell))
const IncidentsPage = lazyPage(() => import('../supervisor/SupervisorConsole').then((m) => m.IncidentsPage))
const IncidentDetailPage = lazyPage(() => import('../supervisor/detail/IncidentDetailPage').then((m) => m.IncidentDetailPage))

/** Empty content slot. Later issues fill these routes; this one does not invent the page. */
function ConsoleSlot() {
  return null
}

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
        element={
          <RequireRole role="supervisor">
            <PageBoundary>
              <ConsoleLayout />
            </PageBoundary>
          </RequireRole>
        }
      >
        <Route element={<IncidentsShell />}>
          <Route path="/console" element={<IncidentsPage />} />
          <Route path="/console/incidents/:incidentId" element={<IncidentDetailPage />} />
        </Route>
        <Route path="/console/approvals" element={<ConsoleSlot />} />
        <Route path="/console/map" element={<ConsoleSlot />} />
        <Route path="/console/audit" element={<ConsoleSlot />} />
        <Route path="/console/settings" element={<ConsoleSlot />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

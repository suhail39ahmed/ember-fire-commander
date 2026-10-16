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
const ApprovalsPage = lazyPage(() => import('../supervisor/ApprovalsPage').then((m) => m.ApprovalsPage))
const MapPage = lazyPage(() => import('../supervisor/MapPage').then((m) => m.MapPage))
const SettingsPage = lazyPage(() => import('../supervisor/SettingsPage').then((m) => m.SettingsPage))
const AuditLogPage = lazyPage(() => import('../supervisor/AuditLogPage').then((m) => m.AuditLogPage))

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
          <Route path="/console/approvals" element={<ApprovalsPage />} />
          <Route path="/console/map" element={<MapPage />} />
        </Route>
        <Route path="/console/audit" element={<AuditLogPage />} />
        <Route path="/console/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

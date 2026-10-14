import { Route, Routes } from 'react-router-dom'

import { VolunteerApp } from '../pwa/VolunteerApp'
import { SupervisorConsole } from '../supervisor/SupervisorConsole'
import { LoginScreen } from './LoginScreen'
import { RequireRole } from './RoleHome'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginScreen />} />
      <Route
        path="/pwa"
        element={
          <RequireRole role="volunteer">
            <VolunteerApp />
          </RequireRole>
        }
      />
      <Route
        path="/console"
        element={
          <RequireRole role="supervisor">
            <SupervisorConsole />
          </RequireRole>
        }
      />
      <Route path="*" element={<LoginScreen />} />
    </Routes>
  )
}

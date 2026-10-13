import { Route, Routes } from 'react-router-dom'

import { LoginScreen } from './LoginScreen'
import { RequireRole, RoleHome } from './RoleHome'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginScreen />} />
      <Route
        path="/pwa"
        element={
          <RequireRole role="volunteer">
            <RoleHome title="Volunteer" />
          </RequireRole>
        }
      />
      <Route
        path="/console"
        element={
          <RequireRole role="supervisor">
            <RoleHome title="Supervisor console" />
          </RequireRole>
        }
      />
      <Route path="*" element={<LoginScreen />} />
    </Routes>
  )
}

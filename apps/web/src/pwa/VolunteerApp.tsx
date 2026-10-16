import type { EmberApi } from './api/types'
import { VolunteerProvider } from './layout/VolunteerProvider'
import { PhoneLayout } from './layout/PhoneLayout'
import './volunteer.css'
import './screens/screens.css'

/** Volunteer app at /pwa/*. Rendered inside RequireRole role="volunteer", so `me` is set. */
export function VolunteerApp({ api }: { api?: EmberApi }) {
  return (
    <VolunteerProvider api={api}>
      <PhoneLayout />
    </VolunteerProvider>
  )
}

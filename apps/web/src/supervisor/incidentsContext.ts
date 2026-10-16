import { createContext, useContext } from 'react'

import type { SupervisorApi } from './api/types'
import type { Incident, IncidentDetail } from './contracts'
import type { Outcome } from './IncidentView'

/** How often the queue and the open incident are read. */
export const POLL_MS = 5000

/** Why the open incident could not be read. `network` keeps the last known picture on screen. */
export type DetailFailure = 'network' | 'not_found' | 'failed'

export interface IncidentsState {
  queue: Incident[] | null
  detail: IncidentDetail | null
  loadError: string | null
  /** Set when the open incident's last read failed. Cleared by the next good read. */
  detailFailure: DetailFailure | null
  activeId: string | null
  select: (id: string) => void
  /** The client the console reads with. Dialogs on the incident call it, then `refresh`. */
  api: SupervisorApi
  /** Read the queue again now. The open incident follows, because it is read after each queue read. */
  refresh: () => Promise<void>
  /** `lost` is true while ember-api cannot be reached. `lastOkAt` is the last good read, in ms. */
  connection: { lost: boolean; lastOkAt: number | null }
  actions: {
    busyId: string | null
    outcomes: Record<string, Outcome>
    onApprove: (id: string) => void
    onReject: (id: string) => void
    onEdit: (id: string, instruction: string) => void
    onVerify: (id: string) => void
  }
}

export const IncidentsContext = createContext<IncidentsState | null>(null)

export function useIncidents(): IncidentsState {
  const value = useContext(IncidentsContext)
  if (!value) throw new Error('Incident pages must be used within IncidentsShell')
  return value
}

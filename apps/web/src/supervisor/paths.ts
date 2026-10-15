/** Console routes that share one chrome. Later pages fill these slots; they do not add a menu. */

export type ConsoleMenu = 'incidents' | 'approvals' | 'map' | 'audit' | 'settings'

export const CONSOLE_PATHS = {
  incidents: '/console',
  approvals: '/console/approvals',
  map: '/console/map',
  audit: '/console/audit',
  settings: '/console/settings',
} as const

export function consoleIncidentPath(id: string): string {
  return `/console/incidents/${encodeURIComponent(id)}`
}

/** Incident id on `/console/incidents/:id`, or null on the queue and every other console page. */
export function incidentIdFromPath(pathname: string): string | null {
  const prefix = '/console/incidents/'
  if (!pathname.startsWith(prefix)) return null
  const rest = pathname.slice(prefix.length)
  if (!rest || rest.includes('/')) return null
  try {
    return decodeURIComponent(rest)
  } catch {
    return null
  }
}

/** Which menu item owns this path. Null outside the console chrome. */
export function consoleMenu(pathname: string): ConsoleMenu | null {
  if (pathname === CONSOLE_PATHS.incidents || pathname.startsWith('/console/incidents/')) return 'incidents'
  if (pathname === CONSOLE_PATHS.approvals || pathname.startsWith(`${CONSOLE_PATHS.approvals}/`)) return 'approvals'
  if (pathname === CONSOLE_PATHS.map || pathname.startsWith(`${CONSOLE_PATHS.map}/`)) return 'map'
  if (pathname === CONSOLE_PATHS.audit || pathname.startsWith(`${CONSOLE_PATHS.audit}/`)) return 'audit'
  if (pathname === CONSOLE_PATHS.settings || pathname.startsWith(`${CONSOLE_PATHS.settings}/`)) return 'settings'
  return null
}

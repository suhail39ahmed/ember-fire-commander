/** Public runtime flags from GET /config. Kept separate from api.ts so UI tests can mock it without loading Firebase. */

export interface AppConfig {
  demoMode: boolean
}

const apiUrl = import.meta.env.VITE_EMBER_API_URL || 'http://localhost:8080'

/** Public runtime flags. Sign-in reads this before a token exists. */
export async function fetchConfig(): Promise<AppConfig> {
  const response = await fetch(`${apiUrl}/config`)
  if (!response.ok) {
    return { demoMode: false }
  }
  const body = await response.json().catch(() => null) as { demoMode?: unknown } | null
  return { demoMode: body?.demoMode === true }
}

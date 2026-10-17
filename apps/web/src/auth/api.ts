import { getToken } from 'firebase/app-check'
import type { User } from 'firebase/auth'

import { getAppCheck } from './firebase'

export interface Me {
  id: string
  displayName: string
  role: 'volunteer' | 'supervisor'
  /** Whether the volunteer has saved the first-run account details. */
  onboardingComplete?: boolean
  area?: string | null
  /** The volunteer's crew, from GET /me. Absent or null when no crew is set. */
  crewName?: string | null
  roleLabel?: string | null
  supervisorName?: string | null
  phoneMasked?: string | null
  trainingDone?: number | null
  trainingTotal?: number | null
  language?: 'id' | 'en' | 'jv' | 'su' | 'ms' | null
  shareMyLocationWithCrew?: boolean
  demoMode?: boolean
}

export type MePatch = {
  displayName?: string
  phone?: string
  area?: string
  crewName?: string
  onboardingComplete?: boolean
  language?: 'id' | 'en' | 'jv' | 'su' | 'ms'
  shareMyLocationWithCrew?: boolean
}

export interface MeFailure {
  status: number
  code?: string
  message: string
}

const apiUrl = import.meta.env.VITE_EMBER_API_URL || 'http://localhost:8080'

async function appCheckHeader(): Promise<string | null> {
  const appCheck = getAppCheck()
  if (!appCheck) {
    return null
  }
  try {
    const result = await getToken(appCheck, false)
    return result.token || null
  } catch {
    return null
  }
}

export async function fetchMe(user: User, registerVolunteer = false): Promise<{ me: Me } | { error: MeFailure }> {
  if (registerVolunteer) {
    const existing = await fetchMe(user)
    // Existing accounts keep their role; only a roleless Google identity needs registration.
    if (!('error' in existing) || existing.error.code !== 'role_missing') return existing
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await user.getIdToken()}`,
  }
  const appCheckToken = await appCheckHeader()
  if (appCheckToken) {
    headers['X-Firebase-AppCheck'] = appCheckToken
  }
  const response = await fetch(`${apiUrl}${registerVolunteer ? '/volunteers/register' : '/me'}`, {
    headers, method: registerVolunteer ? 'POST' : 'GET',
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null
    return {
      error: {
        status: response.status,
        code: body?.error?.code,
        message: body?.error?.message || `HTTP ${response.status}`,
      },
    }
  }
  const me = await response.json() as Me
  if (registerVolunteer) await user.getIdToken(true)
  return { me }
}

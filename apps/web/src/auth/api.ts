import { getToken } from 'firebase/app-check'
import type { User } from 'firebase/auth'

import { getAppCheck } from './firebase'

export interface Me {
  id: string
  displayName: string
  role: 'volunteer' | 'supervisor'
  /** The volunteer's crew, from GET /me. Absent or null when no crew is set. */
  crewName?: string | null
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

export async function fetchMe(user: User): Promise<{ me: Me } | { error: MeFailure }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await user.getIdToken()}`,
  }
  const appCheckToken = await appCheckHeader()
  if (appCheckToken) {
    headers['X-Firebase-AppCheck'] = appCheckToken
  }
  const response = await fetch(`${apiUrl}/me`, { headers })
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
  return { me: await response.json() as Me }
}

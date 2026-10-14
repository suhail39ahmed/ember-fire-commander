import { getToken } from 'firebase/app-check'
import type { User } from 'firebase/auth'

import { getAppCheck } from '../../auth/firebase'

export interface AuthHeaders {
  Authorization: string
  'X-Firebase-AppCheck'?: string
}

export type AuthHeadersProvider = () => Promise<AuthHeaders | null>

/** The two identity headers from contract section 2, for the signed-in Firebase user. */
export function authHeadersFor(user: User | null): AuthHeadersProvider {
  return async () => {
    if (!user) return null
    const headers: AuthHeaders = { Authorization: `Bearer ${await user.getIdToken()}` }
    const appCheck = getAppCheck()
    if (appCheck) {
      try {
        const { token } = await getToken(appCheck, false)
        if (token) headers['X-Firebase-AppCheck'] = token
      } catch {
        // ember-api logs a missing App Check token while enforcement is off.
      }
    }
    return headers
  }
}

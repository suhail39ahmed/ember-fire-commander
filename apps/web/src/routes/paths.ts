import type { Me } from '../auth/api'

/** Google registration entry; eligible signed-in volunteers continue to account setup. */
export const CREATE_ACCOUNT_PATH = '/pwa/create-account'
export const SUPERVISOR_CREATE_ACCOUNT_PATH = '/console/create-account'

export type Audience = 'volunteer' | 'supervisor'

/** The page each role works from. */
export function homeFor(role: Me['role']): string {
  return role === 'volunteer' ? '/pwa' : '/console'
}

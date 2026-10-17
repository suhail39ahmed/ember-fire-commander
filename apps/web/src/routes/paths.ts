import type { Me } from '../auth/api'

/** Where the volunteer starts a new account. That screen is a separate issue (#124). */
export const CREATE_ACCOUNT_PATH = '/pwa/create-account'

export type Audience = 'volunteer' | 'supervisor'

/** The page each role works from. */
export function homeFor(role: Me['role']): string {
  return role === 'volunteer' ? '/pwa' : '/console'
}

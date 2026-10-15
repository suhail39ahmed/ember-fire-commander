import type { Me } from '../auth/api'

export type Audience = 'volunteer' | 'supervisor'

/** The page each role works from. */
export function homeFor(role: Me['role']): string {
  return role === 'volunteer' ? '/pwa' : '/console'
}

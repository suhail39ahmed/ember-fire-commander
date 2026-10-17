/** Why a signed-in user was turned away by ember-api with a 401. */
export type AuthFailure = 'session-expired' | 'device-unverified'

/**
 * Tells the two 401s apart. ember-api answers both with `401 unauthorized` (an App Check
 * rejection has no code of its own), so the App Check case is read from its message.
 * Any other status is not an auth failure.
 */
export function classifyAuthFailure(failure: { status: number | null; message: string }): AuthFailure | null {
  if (failure.status !== 401) return null
  return /^App Check token/i.test(failure.message) ? 'device-unverified' : 'session-expired'
}

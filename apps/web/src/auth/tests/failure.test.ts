import { describe, expect, it } from 'vitest'

import { classifyAuthFailure } from '../failure'

describe('classifyAuthFailure', () => {
  it('reads an expired or invalid ID token as an expired session', () => {
    expect(classifyAuthFailure({ status: 401, message: 'ID token is expired' })).toBe('session-expired')
    expect(classifyAuthFailure({ status: 401, message: 'Not signed in' })).toBe('session-expired')
  })

  it('reads an App Check rejection as a device that could not be verified', () => {
    expect(classifyAuthFailure({ status: 401, message: 'App Check token is missing' })).toBe('device-unverified')
    expect(classifyAuthFailure({ status: 401, message: 'App Check token is expired' })).toBe('device-unverified')
    expect(classifyAuthFailure({ status: 401, message: 'App Check token is invalid' })).toBe('device-unverified')
  })

  it('ignores every other status', () => {
    expect(classifyAuthFailure({ status: 403, message: 'No role' })).toBeNull()
    expect(classifyAuthFailure({ status: 500, message: 'App Check token is invalid' })).toBeNull()
    expect(classifyAuthFailure({ status: null, message: 'Network error' })).toBeNull()
  })
})

import { describe, expect, it, vi } from 'vitest'

import { ApiError, type EmberApi } from '../api/types'
import { reportAuthFailures } from '../api/reportAuthFailures'

function apiThatFails(error: unknown): EmberApi {
  return {
    getDigest: () => Promise.reject(error),
    markTaskHeard: () => Promise.resolve(),
  } as unknown as EmberApi
}

describe('reportAuthFailures', () => {
  it('reports an expired session once and still throws, so the outbox keeps the report', async () => {
    const report = vi.fn()
    const error = new ApiError('unauthorized', 'ID token is expired', 401, false)
    const api = reportAuthFailures(apiThatFails(error), report)
    await expect(api.getDigest()).rejects.toBe(error)
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith('session-expired')
  })

  it('reports a rejected App Check token as a device that could not be verified', async () => {
    const report = vi.fn()
    const api = reportAuthFailures(apiThatFails(new ApiError('unauthorized', 'App Check token is invalid', 401, false)), report)
    await expect(api.getDigest()).rejects.toBeInstanceOf(ApiError)
    expect(report).toHaveBeenCalledWith('device-unverified')
  })

  it('does not report other failures or successful calls', async () => {
    const report = vi.fn()
    const down = reportAuthFailures(apiThatFails(new ApiError('unavailable', 'HTTP 503', 503, true)), report)
    await expect(down.getDigest()).rejects.toBeInstanceOf(ApiError)
    await down.markTaskHeard('task_1')
    expect(report).not.toHaveBeenCalled()
  })
})

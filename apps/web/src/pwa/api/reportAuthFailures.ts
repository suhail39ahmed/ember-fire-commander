import { classifyAuthFailure, type AuthFailure } from '../../auth/failure'
import { ApiError, type EmberApi } from './types'

/**
 * Wraps the ember-api client so a 401 from any signed-in screen is reported once to the auth layer.
 * The error is still thrown, so callers (the outbox above all) keep their own handling and keep the report queued.
 */
export function reportAuthFailures(api: EmberApi, report: (failure: AuthFailure) => void): EmberApi {
  const wrapped = {} as Record<string, unknown>
  for (const key of Object.keys(api) as (keyof EmberApi)[]) {
    if (typeof api[key] !== 'function') {
      wrapped[key] = api[key]
      continue
    }
    const original = api[key] as (...args: unknown[]) => Promise<unknown>
    wrapped[key] = async (...args: unknown[]) => {
      try {
        return await original.apply(api, args)
      } catch (error) {
        if (error instanceof ApiError) {
          const failure = classifyAuthFailure(error)
          if (failure) report(failure)
        }
        throw error
      }
    }
  }
  return wrapped as unknown as EmberApi
}

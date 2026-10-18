export class CallRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

/** Flask/proxy failures can return HTML, which Safari reports as a string-pattern error. */
export async function readCallResponse<T>(response: Response): Promise<T> {
  const fallback = response.ok
    ? 'The call service returned an invalid response. Please try again.'
    : `The call service could not complete this request (HTTP ${response.status}). Please try again.`
  let result: unknown
  try { result = await response.json() }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new CallRequestError(fallback, response.status)
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new CallRequestError(fallback, response.status)
  }
  if (!response.ok) {
    const error = (result as { error?: { message?: unknown } }).error
    throw new CallRequestError(typeof error?.message === 'string' ? error.message : fallback, response.status)
  }
  return result as T
}

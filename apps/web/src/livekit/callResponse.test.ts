import { describe, expect, it } from 'vitest'
import { CallRequestError, readCallResponse } from './callResponse'

describe('call API responses', () => {
  it('returns valid call credentials unchanged', async () => {
    const body = { callId: 'call', serverUrl: 'wss://test.livekit.cloud', participantToken: 'test', speakerId: 'v' }
    await expect(readCallResponse(Response.json(body, { status: 201 }))).resolves.toEqual(body)
  })

  it('preserves server validation messages and authorization status', async () => {
    const response = Response.json({ error: { message: 'This invitation has expired.' } }, { status: 403 })
    await expect(readCallResponse(response)).rejects.toMatchObject({ message: 'This invitation has expired.', status: 403 })
  })

  it.each([500, 502, 404])('reports HTML HTTP %s failures without exposing a parser error or response body', async (status) => {
    const response = new Response('<html>private server diagnostics</html>', { status, headers: { 'Content-Type': 'text/html' } })
    await expect(readCallResponse(response)).rejects.toEqual(new CallRequestError(
      `The call service could not complete this request (HTTP ${status}). Please try again.`, status,
    ))
  })

  it.each(['', '<html>Hosting fallback</html>', 'null', '[]'])('rejects malformed successful responses: %s', async (body) => {
    await expect(readCallResponse(new Response(body))).rejects.toMatchObject({
      message: 'The call service returned an invalid response. Please try again.', status: 200,
    })
  })
})

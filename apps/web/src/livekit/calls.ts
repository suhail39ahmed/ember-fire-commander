import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { useAuth } from '../auth/AuthProvider'
import { authHeadersFor } from '../pwa/api/authHeaders'
import { API_BASE_URL } from '../pwa/api/config'

export interface IncidentCall {
  id: string; incidentId: string; supervisorId: string; volunteerId: string
  supervisorName: string; volunteerName: string
  status: 'requested' | 'connecting' | 'active' | 'ended' | 'cancelled' | 'declined' | 'expired'
  createdAt: string; expiresAt: string; acceptedAt?: string; endReason?: string
  notification?: 'sent' | 'skipped' | 'failed'; mediaClosed?: boolean
  joinCode?: string; requestedVolunteerId?: string
  visualObservation?: { text: string; at: string }
}
export interface CallCredentials { serverUrl: string; participantToken: string; callId: string; speakerId: string }
export interface CallSnapshot { id: string; callId: string; volunteerId: string; requestedVolunteerId?: string; volunteerName: string; capturedAt: string; url: string }
export const callIsOpen = (call: IncidentCall | null) => !!call && ['requested', 'connecting', 'active'].includes(call.status)

class CallRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export async function callRequest<T>(user: User | null, path: string, method = 'GET', data?: unknown): Promise<T> {
  const headers = await authHeadersFor(user)()
  if (!headers) throw new Error('Sign in to use live calling.')
  const binary = data instanceof Blob
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method, headers: { ...headers, ...(data === undefined ? {} : { 'Content-Type': binary ? data.type : 'application/json' }) },
    body: data === undefined ? undefined : binary ? data : JSON.stringify(data),
    signal: AbortSignal.timeout(/\/(ask|suggestions|vision)$/.test(path) ? 60000 : 20000),
  })
  const result = await response.json()
  if (!response.ok) throw new CallRequestError(result?.error?.message || 'The call service could not complete this request.', response.status)
  return result as T
}

/** Owns one popup/invitation session. Server state decides when media may connect. */
export function useIncidentCall(incidentId?: string, volunteerId?: string) {
  const { user } = useAuth()
  const [call, setCall] = useState<IncidentCall | null>(null)
  const [credentials, setCredentials] = useState<CallCredentials | null>(null)
  const [context, setContext] = useState<AudioContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)
  const [video, setVideo] = useState(true)
  const current = useRef(call)
  current.current = call
  const audio = useRef<AudioContext | null>(null)
  const mounted = useRef(true)
  const mutation = useRef(0)
  const request = useCallback(<T,>(path: string, method = 'GET', data?: unknown) => callRequest<T>(user, path, method, data), [user])

  const primeAudio = useCallback(() => {
    if (!audio.current || audio.current.state === 'closed') audio.current = new AudioContext()
    const next = audio.current
    void next.resume().then(() => { if (mounted.current) setContext(next) }).catch(() => setError('Tap Enable audio to start sound and transcription.'))
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; void audio.current?.close(); audio.current = null }
  }, [])

  useEffect(() => {
    if (!user) return
    let disposed = false
    let timer: number
    async function poll() {
      const revision = mutation.current
      try {
        const active = current.current
        const next = active && callIsOpen(active)
          ? await request<IncidentCall>(`/calls/${active.id}`)
          : (await request<{ call: IncidentCall | null }>('/calls/current')).call
        if (disposed || revision !== mutation.current) return
        if (next && (!incidentId || next.incidentId === incidentId && (next.requestedVolunteerId ?? next.volunteerId) === volunteerId)) {
          setCall(next)
          if (!callIsOpen(next)) setCredentials(null)
        }
      } catch (err) {
        if (!disposed && revision === mutation.current && callIsOpen(current.current)) {
          if (err instanceof CallRequestError && [403, 404].includes(err.status)) {
            setCall(null); setCredentials(null)
          }
          setError(err instanceof Error ? err.message : 'Reconnecting to call service…')
        }
      } finally {
        if (!disposed) timer = window.setTimeout(poll, 2500)
      }
    }
    void poll()
    return () => { disposed = true; window.clearTimeout(timer) }
  }, [user, request, incidentId, volunteerId])

  const callId = call?.id
  const accepted = call?.status === 'connecting' || call?.status === 'active'
  useEffect(() => {
    if (!accepted || !callId) { setCredentials(null); return }
    let disposed = false
    void request<CallCredentials>(`/calls/${callId}/token`, 'POST').then((value) => {
      if (!disposed) setCredentials(value)
    }).catch((err) => { if (!disposed) setError(err.message) })
    return () => { disposed = true }
  }, [accepted, callId, request])

  useEffect(() => {
    if (!accepted || !callId) return
    let disposed = false
    const beat = () => void request<IncidentCall>(`/calls/${callId}/heartbeat`, 'POST', { connected }).catch((err) => {
      if (!disposed) setError(err.message)
    })
    beat()
    const timer = window.setInterval(beat, 10000)
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener('beforeunload', warn) }
  }, [accepted, callId, connected, request])

  useEffect(() => {
    if (!accepted && call?.status !== 'requested') {
      void audio.current?.close(); audio.current = null; setContext(null); setConnected(false)
    }
  }, [accepted, call?.status])

  const start = async () => {
    if (busy || !incidentId || !volunteerId) return
    setBusy(true); setError(null)
    mutation.current++
    try {
      primeAudio()
      const next = await request<IncidentCall>(`/incidents/${incidentId}/calls`, 'POST', { volunteerId })
      if (mounted.current) setCall(next)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not request a call.') }
    finally { setBusy(false) }
  }
  const join = async () => {
    if (!call || busy) return
    setBusy(true); setError(null)
    mutation.current++
    try {
      primeAudio()
      setVideo(true)
      setCall(await request<IncidentCall>(`/calls/${call.id}/accept`, 'POST'))
    } catch (err) { setError(err instanceof Error ? err.message : 'This invitation is no longer available.') }
    finally { setBusy(false) }
  }
  const joinCode = async (code: string, withVideo: boolean) => {
    if (busy) return
    setBusy(true); setError(null); mutation.current++
    try {
      primeAudio(); setVideo(withVideo)
      setCall(await request<IncidentCall>('/calls/join-code', 'POST', { code }))
    } catch (err) { setError(err instanceof Error ? err.message : 'This call code is unavailable.') }
    finally { setBusy(false) }
  }
  const end = async (reason = 'ended') => {
    const active = current.current
    if (!active || !callIsOpen(active)) return true
    setBusy(true); setError(null)
    mutation.current++
    try {
      const next = await request<IncidentCall>(`/calls/${active.id}/end`, 'POST', { reason })
      setCall(next); setCredentials(null)
      if (next.mediaClosed === false) { setError('You left the call. Server is retrying remote disconnection.'); return false }
      return true
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not end the call. Try again.'); return false }
    finally { setBusy(false) }
  }
  return useMemo(() => ({ call, credentials, context, error, busy, connected, video, setConnected, setError, start, join, joinCode, end, primeAudio, request }),
    // Actions intentionally capture the latest call and busy state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [call, credentials, context, error, busy, connected, video, primeAudio, request])
}
export type CallController = ReturnType<typeof useIncidentCall>

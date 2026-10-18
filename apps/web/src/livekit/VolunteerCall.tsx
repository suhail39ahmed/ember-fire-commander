import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { callIsOpen, useIncidentCall, type IncidentCall } from './calls'
import './incidentCall.css'

const Media = lazy(() => import('./IncidentCallMedia'))

export default function VolunteerCall({ blocked, onVisibility }: { blocked: boolean; onVisibility: (open: boolean) => void }) {
  const controller = useIncidentCall()
  const { call, request } = controller
  const location = useLocation()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [clock, setClock] = useState(Date.now())
  const panel = useRef<HTMLElement>(null)
  const current = useRef(controller)
  current.current = controller
  const open = !blocked && callIsOpen(call) && !(call?.status === 'requested' && call.id === dismissed)
  useEffect(() => {
    const join = (event: Event) => {
      const detail = (event as CustomEvent<{ code: string; video: boolean }>).detail
      if (detail && typeof detail.code === 'string' && !blocked) void current.current.joinCode(detail.code, detail.video)
    }
    window.addEventListener('ember-join-call-code', join)
    return () => window.removeEventListener('ember-join-call-code', join)
  }, [blocked])
  useEffect(() => {
    onVisibility(open)
    if (open) panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => onVisibility(false)
  }, [open, onVisibility])
  useEffect(() => {
    if (blocked && callIsOpen(current.current.call)) void current.current.end()
  }, [blocked, call?.id])
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('call')
    if (!id || !/^[a-f0-9]{64}$/.test(id)) return
    let disposed = false
    void request<IncidentCall>(`/calls/${id}`).then((value) => {
      if (!disposed && !callIsOpen(value)) setNotice('This call invitation has ended. Your supervisor can send a new request.')
    }).catch(() => { if (!disposed) setNotice('This call invitation is unavailable.') })
    return () => { disposed = true }
  }, [location.search, request])
  useEffect(() => {
    if (controller.credentials) window.dispatchEvent(new Event('ember-call-start'))
  }, [controller.credentials])

  if (blocked) return null
  if (!call || !open) return notice || controller.error ? <div className="call-invite-notice" role="status">{controller.error || notice}<button type="button" onClick={() => { setNotice(''); controller.setError(null) }}>Dismiss</button></div> : null
  const seconds = Math.min(45, Math.max(0, Math.ceil((Date.parse(call.expiresAt) - clock) / 1000)))
  return <div className="volunteer-call-backdrop">
    <section className="volunteer-call-panel" ref={panel} role="dialog" aria-modal="true" aria-label="Supervisor call">
      <header><span className="call-state-label">EMBER · {call.status === 'requested' ? 'INCOMING CALL' : 'LIVE CALL'}</span><h2>{call.supervisorName}</h2></header>
      {call.status === 'requested' ? <>
        <h3>Your supervisor is requesting live video</h3>
        <p>Share your camera and talk with your supervisor. Speech is transcribed by Gemini and shared with the call participants.</p>
        <p className="small">Expires in {seconds}s · Camera and microphone start after you join.</p>
        <div className="call-invite-actions"><button type="button" className="call-request" disabled={controller.busy || seconds === 0} onClick={() => void controller.join()}>Join call</button>
          <button type="button" disabled={controller.busy} onClick={() => void controller.end('declined')}>Decline</button></div>
        <button type="button" className="call-profile-join" onClick={() => { setDismissed(call.id); navigate('/pwa/profile') }}>Enter a call code in Profile instead</button>
      </> : controller.credentials ? <Suspense fallback={<p>Connecting…</p>}><Media controller={controller} volunteer /></Suspense> : <>
        <p>Connecting to your supervisor…</p><button type="button" onClick={() => void controller.end()}>Leave call</button>
      </>}
      {controller.error && <p role="alert" className="call-error">{controller.error}</p>}
    </section>
  </div>
}

import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './livekitLauncher.css'

const TestPanel = lazy(() => import('./LiveKitTestPanel'))

/** Temporary opt-in entry point. The media SDK loads only when opened. */
export function LiveKitTestLauncher({ role, accountMenu = false }: { role: 'volunteer' | 'supervisor'; accountMenu?: boolean }) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (open && accountMenu) dialog.current?.showModal()
  }, [open, accountMenu])
  if (import.meta.env.VITE_LIVEKIT_TEST_ENABLED !== 'true') return null
  if (accountMenu) return <>
    <button type="button" className="console-signout" aria-haspopup="dialog" onClick={(event) => {
      event.currentTarget.closest('details')?.removeAttribute('open')
      setOpen(true)
    }}>Test connectivity</button>
    {open && createPortal(<dialog ref={dialog} className="livekit-connectivity-dialog" aria-labelledby="connectivity-title"
      onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <header><h2 id="connectivity-title">Test connectivity</h2><button type="button" aria-label="Close connectivity test" onClick={() => setOpen(false)}>×</button></header>
      <Suspense fallback={<p role="status">Loading call test…</p>}><TestPanel role={role} /></Suspense>
    </dialog>, document.body)}
  </>
  return (
    <section style={{ padding: '8px 16px' }} aria-label="LiveKit test">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Close LiveKit test' : 'LiveKit test · Connect / Receive'}
      </button>
      {open && <Suspense fallback={<p role="status">Loading video test…</p>}>
        <TestPanel role={role} />
      </Suspense>}
    </section>
  )
}

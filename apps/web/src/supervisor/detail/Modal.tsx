import { useEffect, useId, useRef, type ReactNode } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Dialog shell for the actions that open from an incident. Closing it (Escape, the
 * backdrop, or a Cancel button the caller draws) never writes anything.
 * Focus moves into the dialog, stays inside while it is open, and returns to the
 * button that opened it.
 */
export function Modal({
  title,
  onClose,
  dismissible = true,
  wide = false,
  children,
}: {
  title: string
  onClose(): void
  /** False while a write is in flight, so the dialog cannot be dismissed half way. */
  dismissible?: boolean
  /** The wide panel the volunteer pop-up uses. */
  wide?: boolean
  children: ReactNode
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const canClose = useRef(dismissible)
  canClose.current = dismissible

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const node = panel.current
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && canClose.current) {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [])

  return (
    <div className="inc-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && canClose.current) onClose() }}>
      <div ref={panel} className={wide ? 'inc-modal wide' : 'inc-modal'} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 className="inc-modal-title" id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

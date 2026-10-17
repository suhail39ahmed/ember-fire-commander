import { useEffect, useRef } from 'react'

import type { NearbyIncident } from '../contracts/types'
import { t, type Lang } from '../i18n'
import { incidentLabel } from '../incidentName'
import type { DevicePosition } from './arrival'
import { MiniMap, type MapMarker } from './MiniMap'
import { bearingLabel, distanceLabel, type NearbyState } from './nearby'
import { screenStrings } from './strings'
import type { JoinFailure } from './useJoin'

const copy = screenStrings.nearby

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/**
 * Keeps Tab inside the dialog, closes on Escape, moves focus in when it opens and puts it back where it was when it
 * closes. The page behind stays where it is.
 */
function useDialogFocus(onClose: () => void) {
  const root = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const node = root.current
    const before = typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close.current()
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
      before?.focus?.()
    }
  }, [])
  return root
}

/**
 * "Fire reported near you" (Figma VC). Asking to join sends a request; the supervisor adds the volunteer or not.
 * The sheet says what the API sent and no more: no wind line, no supervisor request.
 */
export function JoinSheet({
  incident,
  lang,
  position,
  state,
  sending,
  failure,
  onJoin,
  onClose,
}: {
  incident: NearbyIncident
  lang: Lang
  position: DevicePosition
  state: NearbyState
  sending: boolean
  failure: JoinFailure | null
  onJoin: () => void
  onClose: () => void
}) {
  const root = useDialogFocus(onClose)
  const markers: MapMarker[] = [{ id: incident.id, kind: 'fire', label: t(lang, copy.fireLabel), lat: incident.lat, lng: incident.lng }]
  if (position.kind === 'ok') markers.unshift({ id: 'you', kind: 'you', label: t(lang, copy.youLabel), lat: position.lat, lng: position.lng })
  const facts = [t(lang, screenStrings.severity[incident.severity])]
  if (incident.crewOnSite > 0) facts.push(`${incident.crewOnSite} ${t(lang, copy.crewOnSite)}`)

  return (
    <div className="sheet-scrim" onClick={onClose} data-testid="join-sheet-scrim">
      <div
        ref={root}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onClick={(event) => event.stopPropagation()}
        data-testid="join-sheet"
      >
        <p className="sheet-tag">
          <span className="sheet-dot" aria-hidden="true" />
          {t(lang, copy.sheetTag)} {distanceLabel(incident.distanceM)} {bearingLabel(incident.bearingDeg, lang)} {t(lang, copy.ofYou)}
        </p>
        <h2 id="sheet-title" className="sheet-title">{incidentLabel(incident, lang)}</h2>
        <p className="sheet-facts">{facts.join(' · ')}</p>
        <MiniMap markers={markers} lang={lang} caption={t(lang, copy.mapCaption)} />

        {state === 'ask' && (
          <>
            <button type="button" className="pill ink big" onClick={onJoin} disabled={sending} aria-busy={sending} data-testid="sheet-join">
              {sending ? t(lang, copy.sending) : t(lang, copy.joinNow)}
            </button>
            <button type="button" className="pill ghost big" onClick={onClose}>{t(lang, copy.notNow)}</button>
            {failure && (
              <p className="sheet-error" role="alert">
                {t(lang, failure === 'network' ? copy.sendFailed : copy.cannotJoin)}
              </p>
            )}
            <p className="sheet-foot">{t(lang, copy.sheetFoot)}</p>
          </>
        )}
        {state === 'waiting' && (
          <>
            <p className="sheet-wait" role="status" data-testid="sheet-waiting">
              <strong>{t(lang, copy.waitTitle)}</strong>
              {t(lang, copy.waitBody)}
            </p>
            <button type="button" className="pill ghost big" onClick={onClose}>{t(lang, copy.close)}</button>
          </>
        )}
        {state === 'declined' && (
          <>
            <p className="sheet-wait" role="status">{t(lang, copy.declined)}</p>
            <button type="button" className="pill ghost big" onClick={onClose}>{t(lang, copy.close)}</button>
          </>
        )}
      </div>
    </div>
  )
}

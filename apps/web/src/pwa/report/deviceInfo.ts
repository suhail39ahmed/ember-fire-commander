import { useCallback, useRef } from 'react'

import type { Lang } from '../i18n'
import type { ObservationDevice } from '../contracts/types'
import { useBattery } from '../useDeviceStatus'

interface Connection {
  effectiveType?: string
  type?: string
}

/** The network as the browser names it, in the contract's words. Undefined where the browser does not say. */
export function networkNow(nav: { connection?: Connection } | undefined = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: Connection })): ObservationDevice['network'] {
  const c = nav?.connection
  if (!c) return undefined
  if (c.type === 'wifi') return 'wifi'
  switch (c.effectiveType) {
    case 'slow-2g':
    case '2g':
      return '2g'
    case '3g':
      return '3g'
    case '4g':
      return '4g'
    default:
      return undefined
  }
}

/**
 * What the phone says about itself with a report (contract section 5.1): the battery, the network and the language the
 * app is shown in. A part the browser cannot report is left out, and the whole value is undefined when there is none.
 */
export function deviceOf(batteryPct: number | null, lang: Lang, network: ObservationDevice['network'] = networkNow()): ObservationDevice | undefined {
  const device: ObservationDevice = {}
  if (batteryPct !== null && Number.isFinite(batteryPct)) device.batteryPct = Math.min(100, Math.max(0, Math.round(batteryPct)))
  if (network) device.network = network
  device.language = lang
  return device
}

/** A function that reads the device facts at the moment of sending, from the latest battery reading. */
export function useDeviceFacts(lang: Lang): () => ObservationDevice | undefined {
  const battery = useBattery()
  const latest = useRef({ battery, lang })
  latest.current = { battery, lang }
  return useCallback(() => deviceOf(latest.current.battery, latest.current.lang), [])
}

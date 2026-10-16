import { useEffect, useState } from 'react'

import type { DevicePosition } from './arrival'

const PERMISSION_DENIED = 1

/** Follows the phone's GPS while a screen needs it. Stops when the screen closes. */
export function useDevicePosition(enabled = true, geo: Pick<Geolocation, 'watchPosition' | 'clearWatch'> | null = typeof navigator === 'undefined' ? null : (navigator.geolocation ?? null)): DevicePosition {
  const [position, setPosition] = useState<DevicePosition>({ kind: 'waiting' })
  useEffect(() => {
    if (!enabled) return
    if (!geo) {
      setPosition({ kind: 'unavailable' })
      return
    }
    const id = geo.watchPosition(
      (p) => setPosition({ kind: 'ok', lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }),
      (error) => setPosition(error.code === PERMISSION_DENIED ? { kind: 'denied' } : { kind: 'unavailable' }),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    )
    return () => geo.clearWatch(id)
  }, [enabled, geo])
  return position
}

import { useEffect, useState } from 'react'

interface BatteryManager {
  level: number
  addEventListener(type: 'levelchange', listener: () => void): void
  removeEventListener(type: 'levelchange', listener: () => void): void
}

/** Battery level as a whole percent, from the phone, or null where the browser does not report it. */
export function useBattery(): number | null {
  const [pct, setPct] = useState<number | null>(null)
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const reader = (navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }).getBattery
    if (!reader) return
    let live = true
    let battery: BatteryManager | null = null
    const update = () => battery && live && setPct(Math.round(battery.level * 100))
    reader
      .call(navigator)
      .then((b) => {
        battery = b
        update()
        b.addEventListener('levelchange', update)
      })
      .catch(() => undefined)
    return () => {
      live = false
      battery?.removeEventListener('levelchange', update)
    }
  }, [])
  return pct
}

/** The phone's clock time (ms) when the signal was first seen to be gone, or null while there is signal. */
export function useOfflineSince(online: boolean): number | null {
  const [since, setSince] = useState<number | null>(() => (online ? null : Date.now()))
  useEffect(() => {
    setSince((current) => (online ? null : (current ?? Date.now())))
  }, [online])
  return since
}

/** Phone time in ms, refreshed every `everyMs`, so ages ("12 min ago") stay right on a screen left open. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

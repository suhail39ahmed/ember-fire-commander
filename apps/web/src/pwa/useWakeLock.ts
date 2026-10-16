import { useEffect, useRef } from 'react'

import { WakeLockHolder, type WakeLockApi } from './wakeLock'

const browserApi = (): WakeLockApi | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock

/** Keeps the screen on while `active` is true. Does nothing in a browser without the Screen Wake Lock API. */
export function useWakeLock(active: boolean): void {
  const holder = useRef<WakeLockHolder | null>(null)

  useEffect(() => {
    const instance = new WakeLockHolder(browserApi, () => document.visibilityState === 'visible')
    holder.current = instance
    const onVisibility = () => instance.visibilityChanged()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      instance.dispose()
      holder.current = null
    }
  }, [])

  useEffect(() => {
    holder.current?.setWanted(active)
  }, [active])
}

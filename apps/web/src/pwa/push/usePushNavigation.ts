import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { PUSH_CLICK, pushPath, type PushData } from './target'

/**
 * A push tapped while the app is open opens the screen it belongs to (#133). A WITHDRAW push needs no move: the
 * WITHDRAW screen is drawn over every tab as soon as the digest shows it.
 */
export function usePushNavigation(): void {
  const navigate = useNavigate()
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; data?: PushData } | null
      if (message?.type !== PUSH_CLICK) return
      const path = pushPath(message.data)
      if (message.data?.type !== 'withdraw') navigate(path)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])
}

import { useEffect, useRef } from 'react'
import type { User } from 'firebase/auth'
import { authHeadersFor } from '../api/authHeaders'
import { API_BASE_URL, USE_MOCK_API } from '../api/config'

/** Firestore watches stay on the API. Polling remains the fallback. */
export function useWithdrawUpdates(user: User | null, refresh: () => unknown, enabled = true) {
  const latest = useRef(refresh)
  latest.current = refresh
  useEffect(() => {
    if (!user || !enabled || USE_MOCK_API) return
    const controller = new AbortController()
    let retry: ReturnType<typeof setTimeout> | undefined
    async function connect() {
      try {
        const headers = await authHeadersFor(user)()
        if (!headers || controller.signal.aborted) return
        const response = await fetch(`${API_BASE_URL}/withdraw/events`, { headers: { ...headers }, signal: controller.signal })
        if (!response.ok || !response.body) throw new Error('Stream unavailable')
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let pending = ''
        while (!controller.signal.aborted) {
          const chunk = await reader.read()
          if (chunk.done) break
          pending += decoder.decode(chunk.value, { stream: true })
          let end: number
          while ((end = pending.indexOf('\n\n')) >= 0) {
            const event = pending.slice(0, end)
            pending = pending.slice(end + 2)
            if (event.startsWith('data:')) void latest.current()
          }
        }
      } catch { /* The normal digest/incident poll continues during reconnect. */ }
      if (!controller.signal.aborted) retry = setTimeout(() => void connect(), 2000)
    }
    void connect()
    return () => { controller.abort(); clearTimeout(retry) }
  }, [user, enabled])
}

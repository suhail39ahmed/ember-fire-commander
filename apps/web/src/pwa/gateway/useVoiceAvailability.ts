import { useEffect, useState } from 'react'
import { initialVoiceAvailability, probeVoice, type VoiceAvailability, type VoiceProbeDeps } from './voiceAvailability'

/**
 * Runs the voice check once on load, and again if the gateway URL, the signed-in user or the ticket
 * source changes. `getTicket` must be a stable function (memoized by the caller) or the check repeats.
 */
export function useVoiceAvailability({ url, getAuthHeaders, createSocket, getTicket, timeoutMs }: VoiceProbeDeps): VoiceAvailability {
  const [state, setState] = useState<VoiceAvailability>(() => initialVoiceAvailability(url))

  useEffect(() => {
    if (!url) {
      setState('unavailable')
      return
    }
    let current = true
    setState('checking')
    void probeVoice({ url, getAuthHeaders, createSocket, getTicket, timeoutMs }).then((result) => {
      if (current) setState(result)
    })
    return () => {
      current = false
    }
  }, [url, getAuthHeaders, createSocket, getTicket, timeoutMs])

  return state
}

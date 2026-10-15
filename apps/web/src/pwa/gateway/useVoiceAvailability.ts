import { useEffect, useState } from 'react'
import { initialVoiceAvailability, probeVoice, type VoiceAvailability, type VoiceProbeDeps } from './voiceAvailability'

/** Runs the voice check once on load, and again if the gateway URL or the signed-in user changes. */
export function useVoiceAvailability({ url, getAuthHeaders, createSocket, timeoutMs }: VoiceProbeDeps): VoiceAvailability {
  const [state, setState] = useState<VoiceAvailability>(() => initialVoiceAvailability(url))

  useEffect(() => {
    if (!url) {
      setState('unavailable')
      return
    }
    let current = true
    setState('checking')
    void probeVoice({ url, getAuthHeaders, createSocket, timeoutMs }).then((result) => {
      if (current) setState(result)
    })
    return () => {
      current = false
    }
  }, [url, getAuthHeaders, createSocket, timeoutMs])

  return state
}

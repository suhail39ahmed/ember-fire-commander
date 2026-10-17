import { useState } from 'react'

import { useAuth } from '../auth/AuthProvider'

/** One Google sign-in attempt: `busy` covers the pop-up and the /me check that follows it. */
export function useSignIn() {
  const { status, message, signIn } = useAuth()
  const [pending, setPending] = useState(false)
  const busy = pending || status === 'loading'

  async function onGoogle() {
    setPending(true)
    try {
      await signIn()
    } finally {
      setPending(false)
    }
  }

  return { busy, message, onGoogle }
}

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'

import { fetchMe, type Me } from './api'
import { auth, googleProvider } from './firebase'
import { unregisterPushFor } from '../pwa/push/browser'

type Status = 'loading' | 'signed-out' | 'ready' | 'no-access' | 'error'

interface AuthState {
  status: Status
  user: User | null
  me: Me | null
  message: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  /** Re-run GET /me for the signed-in Firebase user (no-access "Check again"). */
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function loadMe(
  next: User,
  setMe: (me: Me | null) => void,
  setMessage: (message: string | null) => void,
  setStatus: (status: Status) => void,
) {
  setStatus('loading')
  try {
    const result = await fetchMe(next)
    if ('error' in result) {
      setMe(null)
      setStatus(result.error.code === 'role_missing' ? 'no-access' : 'error')
      setMessage(result.error.message)
      return
    }
    setMe(result.me)
    setMessage(null)
    setStatus('ready')
  } catch (err) {
    setMe(null)
    setStatus('error')
    setMessage(err instanceof Error ? err.message : 'Could not reach ember-api')
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    return onAuthStateChanged(auth, async (next) => {
      setUser(next)
      setMe(null)
      if (!next) {
        setStatus('signed-out')
        setMessage(null)
        return
      }
      await loadMe(next, setMe, setMessage, setStatus)
    })
  }, [])

  const value = useMemo<AuthState>(() => ({
    status,
    user,
    me,
    message,
    signIn: async () => {
      setMessage(null)
      try {
        await signInWithPopup(auth, googleProvider)
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Google sign-in failed')
      }
    },
    signOut: async () => {
      await unregisterPushFor(user)
      await signOut(auth)
    },
    refreshMe: async () => {
      if (!user) return
      await loadMe(user, setMe, setMessage, setStatus)
    },
  }), [status, user, me, message])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return value
}

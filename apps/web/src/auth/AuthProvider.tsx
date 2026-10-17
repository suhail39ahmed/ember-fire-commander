import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'

import { fetchMe, type Me } from './api'
import { classifyAuthFailure, type AuthFailure } from './failure'
import { auth, googleProvider } from './firebase'
import { unregisterPushFor } from '../pwa/push/browser'

type Status = 'loading' | 'signed-out' | 'ready' | 'no-access' | 'error' | AuthFailure

interface AuthState {
  status: Status
  user: User | null
  me: Me | null
  message: string | null
  signIn: (options?: { registerVolunteer?: boolean }) => Promise<void>
  signOut: () => Promise<void>
  /**
   * Re-run GET /me for the signed-in Firebase user (no-access "Check again").
   * With `quiet`, the calling screen stays up and shows the wait itself.
   */
  refreshMe: (options?: { quiet?: boolean }) => Promise<void>
  /**
   * A signed-in screen got a 401 from ember-api. The sign-in screen takes over on the same URL;
   * nothing is cleared, so the outbox keeps its reports and the page returns after the next sign-in.
   */
  reportAuthFailure: (failure: AuthFailure) => void
}

const AuthContext = createContext<AuthState | null>(null)

/** `quiet` keeps the current screen up while the check runs, so its own button can show the wait. */
async function loadMe(
  next: User,
  setMe: (me: Me | null) => void,
  setMessage: (message: string | null) => void,
  setStatus: (status: Status) => void,
  quiet = false,
  registerVolunteer = false,
) {
  if (!quiet) setStatus('loading')
  try {
    const result = await fetchMe(next, registerVolunteer)
    if ('error' in result) {
      setMe(null)
      setStatus(
        classifyAuthFailure(result.error)
        ?? (result.error.code === 'role_missing' ? 'no-access' : 'error'),
      )
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
  const userRef = useRef<User | null>(null)
  const registeringRef = useRef(false)

  useEffect(() => {
    return onAuthStateChanged(auth, async (next) => {
      const same = next !== null && next.uid === userRef.current?.uid
      userRef.current = next
      setUser(next)
      // Registration owns the /me check until the server has assigned the volunteer claim.
      if (next && registeringRef.current) return
      if (!next) {
        setMe(null)
        setStatus('signed-out')
        setMessage(null)
        return
      }
      // Signing in again as the same person after a 401 re-checks in place instead of flashing a loading page.
      if (!same) setMe(null)
      await loadMe(next, setMe, setMessage, setStatus, same)
    })
  }, [])

  const reportAuthFailure = useCallback((failure: AuthFailure) => {
    // Without a Firebase user the app is already signed out; there is nothing to expire.
    if (!userRef.current) return
    setStatus(failure)
  }, [])

  const value = useMemo<AuthState>(() => ({
    status,
    user,
    me,
    message,
    signIn: async (options) => {
      setMessage(null)
      const registering = options?.registerVolunteer === true
      registeringRef.current = registering
      try {
        const next = registering && user ? user : (await signInWithPopup(auth, googleProvider)).user
        if (registering) {
          userRef.current = next
          setUser(next)
          await loadMe(next, setMe, setMessage, setStatus, false, true)
          return
        }
        // The same user signing in again does not fire onAuthStateChanged with a new user, so check /me here.
        if (status === 'session-expired' || status === 'device-unverified') {
          await loadMe(next, setMe, setMessage, setStatus, true)
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Google sign-in failed')
      } finally {
        registeringRef.current = false
      }
    },
    signOut: async () => {
      await unregisterPushFor(user)
      await signOut(auth)
    },
    refreshMe: async (options) => {
      if (!user) return
      await loadMe(user, setMe, setMessage, setStatus, options?.quiet === true)
    },
    reportAuthFailure,
  }), [status, user, me, message, reportAuthFailure])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return value
}

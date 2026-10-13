import { useState } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import './login.css'

function homeFor(role: 'volunteer' | 'supervisor') {
  return role === 'volunteer' ? '/pwa' : '/console'
}

function Shield() {
  return (
    <svg width="42" height="48" viewBox="0 0 52 52" aria-hidden="true">
      <path d="M25.6 3.6L42.4 9.44V23.6C42.4 34.56 35.44 42.88 25.6 47.6C15.76 42.88 8.8 34.56 8.8 23.6V9.44L25.6 3.6Z" stroke="#E2531B" strokeWidth="2.56" strokeLinejoin="round" fill="none" />
      <path d="M26.08 12.4C28.32 17.28 33.76 20.32 33.12 27.68C32.64 33.2 29.44 36.48 25.6 36.48C21.6 36.48 18.24 33.44 18.24 28.8C18.24 24.96 20.48 22.88 21.92 20.16C22.88 22.72 24.32 24 25.28 24.32C26.88 21.12 27.2 16.8 26.08 12.4Z" fill="#E2531B" />
    </svg>
  )
}

export function LoginScreen() {
  const { status, me, message, signIn } = useAuth()
  const [pending, setPending] = useState(false)

  if (status === 'ready' && me) {
    return <Navigate to={homeFor(me.role)} replace />
  }

  async function onGoogle() {
    setPending(true)
    try {
      await signIn()
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-brand">
        <div className="lockup"><Shield /> EMBER</div>
        <div>
          <p className="eyebrow">SUPERVISOR CONSOLE · BPBD</p>
          <h1 className="tagline">One safety agent for communities at both ends of the smoke.</h1>
        </div>
        <p className="footnote">The AI advises; people decide.</p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <h1>Sign in</h1>
          <p className="sub">Supervisor Console · BPBD</p>
          {status === 'no-access' ? (
            <p className="error" role="alert">{message || 'This account has no EMBER role.'}</p>
          ) : (
            <button className="google-button" type="button" onClick={onGoogle} disabled={pending || status === 'loading'}>
              Sign in with Google
            </button>
          )}
          {status !== 'no-access' && message ? <p className="error" role="alert">{message}</p> : null}
          <p className="note">Access for invited BPBD supervisors only.</p>
        </div>
      </section>
    </main>
  )
}

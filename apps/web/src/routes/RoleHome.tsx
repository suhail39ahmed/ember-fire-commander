import { Link, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import { useAuth } from '../auth/AuthProvider'
import type { Me } from '../auth/api'
import './login.css'

function homeFor(role: Me['role']) {
  return role === 'volunteer' ? '/pwa' : '/console'
}

export function RequireRole({ role, children }: { role: Me['role']; children: ReactNode }) {
  const { status, me, message, signOut } = useAuth()
  if (status === 'loading') {
    return <main className="role-screen"><p>Checking sign-in…</p></main>
  }
  if (status === 'signed-out') {
    return <Navigate to="/" replace />
  }
  if (status === 'no-access' || !me) {
    return (
      <main className="role-screen">
        <h1>No access</h1>
        <p className="error" role="alert">{message || 'This account has no EMBER role.'}</p>
        <button className="sign-out" type="button" onClick={() => { void signOut() }}>Sign out</button>
      </main>
    )
  }
  if (me.role !== role) {
    return (
      <main className="role-screen">
        <p className="eyebrow">EMBER</p>
        <h1>This page is not for your role</h1>
        <p>You are signed in as {me.displayName || me.id} ({me.role}).</p>
        <p className="note">Open your own page, or sign out.</p>
        <p>
          <Link className="text-button" to={homeFor(me.role)}>Your page</Link>
          <button className="sign-out" type="button" onClick={() => { void signOut() }}>Sign out</button>
        </p>
      </main>
    )
  }
  return children
}

export function RoleHome({ title }: { title: string }) {
  const { me, signOut } = useAuth()
  if (!me) {
    return null
  }
  return (
    <main className="role-screen">
      <p className="eyebrow">EMBER</p>
      <h1>{title}</h1>
      <section className="me-card" aria-label="Signed-in user">
        <p><strong>User:</strong> {me.displayName || '—'}</p>
        <p><strong>Role:</strong> {me.role}</p>
        <p><strong>ID:</strong> {me.id}</p>
      </section>
      <button className="sign-out" type="button" onClick={() => { void signOut() }}>Sign out</button>
    </main>
  )
}

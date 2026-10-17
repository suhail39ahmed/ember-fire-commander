import type { Me } from '../auth/api'
import type { Digest } from './contracts/types'

const PROFILE = 'ember.offline.profile.v1'
const DIGEST = 'ember.offline.digest.v1'

function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Offline storage may be full or disabled. */ }
}

export function saveOfflineProfile(me: Me) {
  if (me.role === 'volunteer') write(PROFILE, me)
  else clearOfflineCache()
}

export function readOfflineProfile(uid: string): Me | null {
  const me = read(PROFILE) as Me | null
  return me?.id === uid && me.role === 'volunteer' && typeof me.displayName === 'string' ? me : null
}

export function saveOfflineDigest(uid: string, digest: Digest, receivedAt: string) {
  write(DIGEST, { uid, digest, receivedAt })
}

export function readOfflineDigest(uid: string | null): { digest: Digest; receivedAt: string } | null {
  if (!uid) return null
  const cached = read(DIGEST) as { uid?: string; digest?: Digest; receivedAt?: string } | null
  if (cached?.uid !== uid || !cached.digest || !Array.isArray(cached.digest.incidents) || !Array.isArray(cached.digest.myTasks) || typeof cached.receivedAt !== 'string' || !Number.isFinite(Date.parse(cached.receivedAt))) return null
  return { digest: cached.digest, receivedAt: cached.receivedAt }
}

export function clearOfflineCache() {
  try { localStorage.removeItem(PROFILE); localStorage.removeItem(DIGEST) } catch { /* Storage is optional. */ }
}

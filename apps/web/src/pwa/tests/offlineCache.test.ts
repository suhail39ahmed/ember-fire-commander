import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearOfflineCache, readOfflineDigest, readOfflineProfile, saveOfflineDigest, saveOfflineProfile } from '../offlineCache'

beforeEach(() => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('offline field data', () => {
  it('restores only the signed-in volunteer profile and clears it on sign-out', () => {
    const me = { id: 'sari', role: 'volunteer' as const, displayName: 'Sari', sms: { recipients: [{ id: 'lead', name: 'Lead', role: 'crew_lead' as const, phone: '+6281212345678' }], templates: { help: '{status}', safe: '{status}', spreading: '{status}' } } }
    saveOfflineProfile(me)
    expect(readOfflineProfile('sari')).toEqual(me)
    expect(readOfflineProfile('other')).toBeNull()
    clearOfflineCache()
    expect(readOfflineProfile('sari')).toBeNull()
    saveOfflineProfile(me)
    saveOfflineProfile({ id: 'sari', role: 'supervisor', displayName: 'Sari' })
    expect(readOfflineProfile('sari')).toBeNull()
  })

  it('retains the last successful digest with its original sync time and isolates accounts', () => {
    const digest = { incidents: [], myTasks: [], updatedAt: '2026-10-18T00:00:00Z' }
    saveOfflineDigest('sari', digest, '2026-10-18T00:01:00Z')
    expect(readOfflineDigest('sari')).toEqual({ digest, receivedAt: '2026-10-18T00:01:00Z' })
    expect(readOfflineDigest('other')).toBeNull()
    clearOfflineCache()
    expect(readOfflineDigest('sari')).toBeNull()
  })

  it('tolerates unavailable or corrupt storage', () => {
    localStorage.setItem('ember.offline.profile.v1', 'invalid JSON')
    expect(readOfflineProfile('sari')).toBeNull()
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('disabled') }, setItem: () => { throw new Error('disabled') }, removeItem: () => { throw new Error('disabled') } })
    expect(readOfflineDigest('sari')).toBeNull()
    expect(() => saveOfflineProfile({ id: 'sari', role: 'volunteer', displayName: 'Sari' })).not.toThrow()
    expect(() => clearOfflineCache()).not.toThrow()
  })
})

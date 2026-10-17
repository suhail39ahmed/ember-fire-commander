import type { User } from 'firebase/auth'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../firebase', () => ({ getAppCheck: () => null }))
import { fetchMe } from '../api'

afterEach(() => { vi.unstubAllGlobals() })

describe('PWA volunteer registration', () => {
  it('registers a roleless identity and refreshes its Firebase claim before continuing', async () => {
    const getIdToken = vi.fn().mockResolvedValue('token')
    const user = { getIdToken } as unknown as User
    const me = { id: 'new', displayName: 'New', role: 'volunteer', onboardingComplete: false }
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'role_missing' } }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(me)))
    vi.stubGlobal('fetch', fetch)
    expect(await fetchMe(user, true)).toEqual({ me })
    expect(fetch.mock.calls[0][0]).toMatch(/\/me$/)
    expect(fetch.mock.calls[1]).toEqual([expect.stringMatching(/\/volunteers\/register$/), expect.objectContaining({ method: 'POST' })])
    expect(getIdToken).toHaveBeenLastCalledWith(true)
  })

  it('preserves a supervisor account and never attempts role assignment', async () => {
    const user = { getIdToken: vi.fn().mockResolvedValue('token') } as unknown as User
    const me = { id: 'supervisor', role: 'supervisor' }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(me)))
    vi.stubGlobal('fetch', fetch)
    expect(await fetchMe(user, true)).toEqual({ me })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not attempt registration when identity verification fails', async () => {
    const user = { getIdToken: vi.fn().mockResolvedValue('expired') } as unknown as User
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'unauthorized' } }), { status: 401 }))
    vi.stubGlobal('fetch', fetch)
    expect(await fetchMe(user, true)).toMatchObject({ error: { status: 401 } })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

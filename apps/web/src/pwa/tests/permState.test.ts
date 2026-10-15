import { describe, expect, it, vi } from 'vitest'
import { askPermission, detectPlatform, queryPermission, readPerms, type PermEnv } from '../permissions/permState'

const track = () => ({ stop: vi.fn() })
const stream = (tracks = [track(), track()]) => ({ getTracks: () => tracks })
const grant = async (): Promise<NotificationPermission> => 'granted'
const deny = async (): Promise<NotificationPermission> => 'denied'
const domError = (name: string) => Object.assign(new Error(name), { name })
const fullEnv = (over: Partial<PermEnv> = {}): PermEnv => ({
  geolocation: { getCurrentPosition: (ok) => ok({} as GeolocationPosition) },
  mediaDevices: { getUserMedia: async () => stream() },
  permissions: { query: async () => ({ state: 'prompt' }) },
  notification: { permission: 'default', requestPermission: grant },
  ...over,
})

describe('queryPermission', () => {
  it('reports unsupported when the browser lacks the API', async () => {
    expect(await queryPermission('microphone', {})).toBe('unsupported')
    expect(await queryPermission('location', {})).toBe('unsupported')
    expect(await queryPermission('notifications', {})).toBe('unsupported')
  })

  it('reads the Permissions API for microphone, camera and location, using the geolocation name', async () => {
    const query = vi.fn(async () => ({ state: 'granted' }))
    const env = fullEnv({ permissions: { query } })
    expect(await queryPermission('microphone', env)).toBe('granted')
    expect(await queryPermission('location', env)).toBe('granted')
    expect(query).toHaveBeenCalledWith({ name: 'geolocation' })
  })

  it('returns null, not "prompt", when the browser cannot tell', async () => {
    const throwing = fullEnv({ permissions: { query: async () => { throw new TypeError('bad name') } } })
    expect(await queryPermission('microphone', throwing)).toBeNull()
    expect(await queryPermission('camera', fullEnv({ permissions: undefined }))).toBeNull()
  })

  it('maps Notification.permission default to prompt', async () => {
    expect(await queryPermission('notifications', fullEnv())).toBe('prompt')
    expect(await queryPermission('notifications', fullEnv({ notification: { permission: 'denied', requestPermission: deny } }))).toBe('denied')
  })
})

describe('askPermission', () => {
  it('asks for audio on the microphone tap and stops the tracks straight away', async () => {
    const tracks = [track(), track()]
    const getUserMedia = vi.fn(async () => stream(tracks))
    expect(await askPermission('microphone', fullEnv({ mediaDevices: { getUserMedia } }))).toBe('granted')
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    tracks.forEach((tr) => expect(tr.stop).toHaveBeenCalled())
  })

  it('asks for video on the camera tap', async () => {
    const getUserMedia = vi.fn(async () => stream())
    await askPermission('camera', fullEnv({ mediaDevices: { getUserMedia } }))
    expect(getUserMedia).toHaveBeenCalledWith({ video: true })
  })

  it('maps a refusal to denied, a missing device to unsupported, and a busy device to unknown', async () => {
    const withError = (name: string) => fullEnv({ mediaDevices: { getUserMedia: async () => { throw domError(name) } } })
    expect(await askPermission('microphone', withError('NotAllowedError'))).toBe('denied')
    expect(await askPermission('microphone', withError('SecurityError'))).toBe('denied')
    expect(await askPermission('camera', withError('NotFoundError'))).toBe('unsupported')
    expect(await askPermission('camera', withError('NotReadableError'))).toBeNull()
  })

  it('maps a location fix to granted, a refusal to denied, and a timeout to unknown', async () => {
    const fail = (code: number): PermEnv => fullEnv({ geolocation: { getCurrentPosition: (_ok, err) => err?.({ code } as GeolocationPositionError) } })
    expect(await askPermission('location', fullEnv())).toBe('granted')
    expect(await askPermission('location', fail(1))).toBe('denied')
    expect(await askPermission('location', fail(3))).toBeNull()
  })

  it('returns what Notification.requestPermission resolved with, or reads it back for the callback form', async () => {
    expect(await askPermission('notifications', fullEnv({ notification: { permission: 'default', requestPermission: deny } }))).toBe('denied')
    const legacy: PermEnv = { notification: { permission: 'granted', requestPermission: () => undefined } }
    expect(await askPermission('notifications', legacy)).toBe('granted')
  })
})

describe('readPerms', () => {
  it('lets the browser win and falls back to what a tap taught us only where it cannot tell', async () => {
    const env = fullEnv({
      permissions: {
        query: async ({ name }) => {
          if (name === 'camera') return { state: 'denied' }
          throw new TypeError('unsupported name')
        },
      },
    })
    const perms = await readPerms(env, { microphone: 'granted', camera: 'granted', location: 'denied' })
    expect(perms.microphone).toBe('granted')
    expect(perms.camera).toBe('denied')
    expect(perms.location).toBe('denied')
    expect(perms.notifications).toBe('prompt')
  })

  it('updates a row after Allow on a browser without the Permissions API (the "not asked yet" bug)', async () => {
    const env = fullEnv({ permissions: undefined })
    expect((await readPerms(env, {})).microphone).toBe('prompt')
    const learned = { microphone: await askPermission('microphone', env) }
    expect((await readPerms(env, learned as never)).microphone).toBe('granted')
  })
})

describe('detectPlatform', () => {
  it('recognises iPhone, iPadOS, Android and desktop', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari', 5)).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5)).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 0)).toBe('other')
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120', 5)).toBe('android')
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', 0)).toBe('other')
  })
})

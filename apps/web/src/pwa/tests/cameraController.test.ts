import { describe, expect, it, vi } from 'vitest'

import { CAMERA_CONSTRAINTS, CameraController, stateForError, type CameraEnv, type StreamLike } from '../camera/cameraController'

function fakeStream() {
  const listeners: Array<() => void> = []
  const track = {
    stop: vi.fn(),
    addEventListener: vi.fn((_type: 'ended', fn: () => void) => listeners.push(fn)),
    removeEventListener: vi.fn(),
  }
  const stream: StreamLike = { getTracks: () => [track] }
  return { stream, track, end: () => listeners.forEach((fn) => fn()) }
}

function fakeEnv(getUserMedia: (c: MediaStreamConstraints) => Promise<StreamLike>, over: Partial<CameraEnv> = {}) {
  const doc = { visibilityState: 'visible' as DocumentVisibilityState, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const win = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const env: CameraEnv = { mediaDevices: { getUserMedia }, isSecureContext: true, doc, win, ...over }
  const fire = (target: typeof doc | typeof win, type: string) =>
    target.addEventListener.mock.calls.filter((c) => c[0] === type).forEach((c) => (c[1] as () => void)())
  return { env, doc, win, fire }
}

const rejection = (name: string) => Object.assign(new Error(name), { name })

describe('CameraController', () => {
  it('stays off until start is called, and never asks for the microphone', async () => {
    const f = fakeStream()
    const gum = vi.fn().mockResolvedValue(f.stream)
    const { env } = fakeEnv(gum)
    const camera = new CameraController(env)
    expect(camera.getSnapshot()).toEqual({ state: 'off', stream: null })
    expect(gum).not.toHaveBeenCalled()
    const started = camera.start()
    expect(camera.getSnapshot().state).toBe('starting')
    await started
    expect(camera.getSnapshot()).toEqual({ state: 'on', stream: f.stream })
    expect(gum).toHaveBeenCalledTimes(1)
    expect(gum).toHaveBeenCalledWith(CAMERA_CONSTRAINTS)
    expect(CAMERA_CONSTRAINTS.audio).toBe(false)
    expect(CAMERA_CONSTRAINTS.video).toMatchObject({ facingMode: { ideal: 'environment' } })
  })

  it('does not open a second stream when start is called while starting or on', async () => {
    const f = fakeStream()
    const gum = vi.fn().mockResolvedValue(f.stream)
    const camera = new CameraController(fakeEnv(gum).env)
    await Promise.all([camera.start(), camera.start()])
    await camera.start()
    expect(gum).toHaveBeenCalledTimes(1)
  })

  it('stop releases every track and goes back to off', async () => {
    const f = fakeStream()
    const camera = new CameraController(fakeEnv(vi.fn().mockResolvedValue(f.stream)).env)
    await camera.start()
    camera.stop()
    expect(f.track.stop).toHaveBeenCalledTimes(1)
    expect(camera.getSnapshot()).toEqual({ state: 'off', stream: null })
  })

  it('toggle turns the camera on, then off', async () => {
    const f = fakeStream()
    const camera = new CameraController(fakeEnv(vi.fn().mockResolvedValue(f.stream)).env)
    await camera.toggle()
    expect(camera.getSnapshot().state).toBe('on')
    await camera.toggle()
    expect(camera.getSnapshot().state).toBe('off')
    expect(f.track.stop).toHaveBeenCalled()
  })

  it('releases the camera when the screen unmounts (dispose) and stops listening', async () => {
    const f = fakeStream()
    const { env, doc, win } = fakeEnv(vi.fn().mockResolvedValue(f.stream))
    const camera = new CameraController(env)
    camera.attach()
    await camera.start()
    camera.dispose()
    expect(f.track.stop).toHaveBeenCalled()
    expect(camera.getSnapshot().state).toBe('off')
    expect(doc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(win.removeEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function))
  })

  it('can be attached again after dispose (strict-mode remount)', async () => {
    const { env, doc } = fakeEnv(vi.fn())
    const camera = new CameraController(env)
    camera.attach()
    camera.dispose()
    camera.attach()
    expect(doc.addEventListener).toHaveBeenCalledTimes(2)
  })

  it('stops a camera that arrives after the volunteer already turned it off', async () => {
    const f = fakeStream()
    let resolve!: (s: StreamLike) => void
    const gum = vi.fn(() => new Promise<StreamLike>((r) => (resolve = r)))
    const camera = new CameraController(fakeEnv(gum).env)
    const started = camera.start()
    camera.stop()
    expect(camera.getSnapshot().state).toBe('off')
    resolve(f.stream)
    await started
    expect(f.track.stop).toHaveBeenCalledTimes(1)
    expect(camera.getSnapshot()).toEqual({ state: 'off', stream: null })
  })

  it('stops a camera that arrives after the screen was disposed', async () => {
    const f = fakeStream()
    let resolve!: (s: StreamLike) => void
    const camera = new CameraController(fakeEnv(vi.fn(() => new Promise<StreamLike>((r) => (resolve = r)))).env)
    camera.attach()
    const started = camera.start()
    camera.dispose()
    resolve(f.stream)
    await started
    expect(f.track.stop).toHaveBeenCalledTimes(1)
  })

  it('stops when the page is hidden, and on pagehide', async () => {
    const f = fakeStream()
    const { env, doc, fire, win } = fakeEnv(vi.fn().mockResolvedValue(f.stream))
    const camera = new CameraController(env)
    camera.attach()
    await camera.start()
    fire(doc, 'visibilitychange') // still visible: nothing happens
    expect(camera.getSnapshot().state).toBe('on')
    doc.visibilityState = 'hidden'
    fire(doc, 'visibilitychange')
    expect(camera.getSnapshot().state).toBe('off')
    expect(f.track.stop).toHaveBeenCalledTimes(1)

    const g = fakeStream()
    ;(env.mediaDevices!.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValue(g.stream)
    await camera.start()
    fire(win, 'pagehide')
    expect(camera.getSnapshot().state).toBe('off')
    expect(g.track.stop).toHaveBeenCalledTimes(1)
  })

  it('goes off when the device ends the stream (camera taken by another app)', async () => {
    const f = fakeStream()
    const camera = new CameraController(fakeEnv(vi.fn().mockResolvedValue(f.stream)).env)
    await camera.start()
    f.end()
    expect(camera.getSnapshot()).toEqual({ state: 'off', stream: null })
  })

  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'unavailable'],
    ['OverconstrainedError', 'unavailable'],
    ['NotReadableError', 'busy'],
    ['SomethingElse', 'unavailable'],
  ])('maps %s to %s', async (name, state) => {
    const camera = new CameraController(fakeEnv(vi.fn().mockRejectedValue(rejection(name))).env)
    await camera.start()
    expect(camera.getSnapshot()).toEqual({ state, stream: null })
    expect(stateForError(rejection(name))).toBe(state)
  })

  it('keeps a denied message after stop, and a tap tries again', async () => {
    const f = fakeStream()
    const gum = vi.fn().mockRejectedValueOnce(rejection('NotAllowedError')).mockResolvedValueOnce(f.stream)
    const camera = new CameraController(fakeEnv(gum).env)
    await camera.start()
    camera.stop()
    expect(camera.getSnapshot().state).toBe('denied')
    await camera.toggle()
    expect(camera.getSnapshot().state).toBe('on')
  })

  it('reports unavailable when the browser has no camera API', async () => {
    const camera = new CameraController(fakeEnv(vi.fn(), { mediaDevices: null }).env)
    await camera.start()
    expect(camera.getSnapshot().state).toBe('unavailable')
  })

  it('reports insecure on a page that is not https, without asking the browser', async () => {
    const gum = vi.fn()
    const camera = new CameraController(fakeEnv(gum, { isSecureContext: false }).env)
    await camera.start()
    expect(camera.getSnapshot().state).toBe('insecure')
    expect(gum).not.toHaveBeenCalled()
  })

  it('tells subscribers about every change', async () => {
    const f = fakeStream()
    const camera = new CameraController(fakeEnv(vi.fn().mockResolvedValue(f.stream)).env)
    const seen: string[] = []
    camera.subscribe(() => seen.push(camera.getSnapshot().state))
    await camera.start()
    camera.stop()
    expect(seen).toEqual(['starting', 'on', 'off'])
  })
})

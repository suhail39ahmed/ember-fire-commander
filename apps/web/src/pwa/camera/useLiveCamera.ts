import { useEffect, useState, useSyncExternalStore } from 'react'

import { browserCameraEnv, CameraController, type CameraEnv, type CameraSnapshot, type CameraState } from './cameraController'

export interface LiveCamera {
  state: CameraState
  /** The running stream, to show in a <video>. Null whenever the camera is not on. */
  stream: CameraSnapshot['stream']
  start: () => void
  stop: () => void
  toggle: () => void
}

const SERVER_SNAPSHOT: CameraSnapshot = { state: 'off', stream: null }

/**
 * The live camera for one screen. Off until `start()` or `toggle()` is called from a tap. It stops by itself when the
 * screen unmounts (route change), when the page is hidden, and when the device ends the stream.
 */
export function useLiveCamera(env: CameraEnv = browserCameraEnv()): LiveCamera {
  const [controller] = useState(() => new CameraController(env))
  useEffect(() => {
    controller.attach()
    return () => controller.dispose()
  }, [controller])
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => SERVER_SNAPSHOT)
  return {
    state: snap.state,
    stream: snap.stream,
    start: () => void controller.start(),
    stop: () => controller.stop(),
    toggle: () => void controller.toggle(),
  }
}

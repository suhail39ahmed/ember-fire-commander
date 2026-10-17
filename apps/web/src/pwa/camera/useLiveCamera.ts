import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { browserCameraEnv, CameraController, type CameraEnv, type CameraSnapshot, type CameraState } from './cameraController'
import { VideoRecorder, type VideoRecorderEnv, type VideoRecorderSnapshot } from './videoRecorder'

export interface LiveCamera {
  state: CameraState
  /** The running stream, to show in a <video>. Null whenever the camera is not on. */
  stream: CameraSnapshot['stream']
  start: () => void
  stop: () => void
  toggle: () => void
  /** Stable reference to the recorder. Call setMicStream / takeClip / discard on it. */
  recorder: VideoRecorder
  recorderSnap: VideoRecorderSnapshot
}

const SERVER_SNAPSHOT: CameraSnapshot = { state: 'off', stream: null }
const SERVER_REC_SNAP: VideoRecorderSnapshot = { recording: false, startedAt: null, clip: null, mimeType: null }

/**
 * The live camera for one screen. Off until `start()` or `toggle()` is called from a tap. It stops by itself when the
 * screen unmounts (route change), when the page is hidden, and when the device ends the stream.
 * When the camera is on a VideoRecorder automatically starts and stops with the stream.
 */
export function useLiveCamera(cameraEnv: CameraEnv = browserCameraEnv(), recorderEnv: VideoRecorderEnv = {}): LiveCamera {
  const [controller] = useState(() => new CameraController(cameraEnv))
  const [recorder] = useState(() => new VideoRecorder(recorderEnv))

  useEffect(() => {
    controller.attach()
    return () => controller.dispose()
  }, [controller])

  useEffect(() => {
    return () => recorder.discard()
  }, [recorder])

  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => SERVER_SNAPSHOT)
  const recorderSnap = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot, () => SERVER_REC_SNAP)

  // Track the previous stream so we can detect when it starts/stops.
  const prevStream = useRef<CameraSnapshot['stream']>(null)
  useEffect(() => {
    const stream = snap.stream
    if (stream && stream !== prevStream.current) {
      recorder.start(stream as MediaStream)
    } else if (!stream && prevStream.current) {
      recorder.stop()
    }
    prevStream.current = stream
  }, [snap.stream, recorder])

  return {
    state: snap.state,
    stream: snap.stream,
    start: () => void controller.start(),
    stop: () => controller.stop(),
    toggle: () => void controller.toggle(),
    recorder,
    recorderSnap,
  }
}

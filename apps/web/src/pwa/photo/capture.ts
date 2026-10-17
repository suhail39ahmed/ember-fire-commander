/**
 * Open the phone's camera app or picker for a photo. `beforeOpen` runs first so another part of the screen (the live
 * camera preview) can give the camera back; many phones cannot open the camera for a photo while a preview holds it.
 */
export function openCapture(open: () => void, beforeOpen?: () => void): void {
  try {
    beforeOpen?.()
  } finally {
    open()
  }
}

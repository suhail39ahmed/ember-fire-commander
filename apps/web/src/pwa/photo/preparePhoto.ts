import type { PhotoContentType } from '../contracts/types'

/** Long edge in pixels. Enough to read flame, smoke and ground; keeps uploads small on weak signal. */
export const MAX_EDGE = 1600
export const JPEG_QUALITY = 0.82
export const MAX_INPUT_BYTES = 25 * 1024 * 1024

export interface PreparedPhoto {
  blob: Blob
  contentType: PhotoContentType
  width: number
  height: number
}

export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxEdge) return { width, height }
  const scale = maxEdge / longEdge
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export function isAcceptedImage(file: { type: string; size: number }): boolean {
  return file.type.startsWith('image/') && file.size > 0 && file.size <= MAX_INPUT_BYTES
}

/**
 * Re-encode the photo as JPEG on a canvas. This shrinks it and drops EXIF
 * metadata (device, original GPS); location is sent separately as lat/lng.
 */
export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available')
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob) throw new Error('Could not encode the photo')
    return { blob, contentType: 'image/jpeg', width, height }
  } finally {
    bitmap.close()
  }
}

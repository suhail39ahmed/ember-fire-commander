import type { PhotoContentType, PhotoObservationCreate } from '../contracts/types'
import type { EmberApi } from '../api/types'
import type { Position } from '../report/buildObservation'
import type { UploadFn, UploadOptions } from './upload'

/**
 * Ask ember-api for a signed URL, then PUT the photo to it.
 * Resolves with the private object path. A fresh URL is requested on every
 * attempt, so a retry after expiry works.
 */
export async function uploadPhoto(
  api: Pick<EmberApi, 'createUploadUrl'>,
  upload: UploadFn,
  photo: Blob,
  contentType: PhotoContentType,
  options: UploadOptions = {},
): Promise<string> {
  const target = await api.createUploadUrl(contentType)
  await upload(target, photo, options)
  return target.photoPath
}

/**
 * Builds the photo observation body. Only call this after the upload succeeded.
 * `capturedAt` is when the photo was taken, not when it finished uploading.
 * The client never sends id or severity; ember-api sets both.
 */
export function buildPhotoObservation(photoPath: string, capturedAt: string, pos: Position, note = ''): PhotoObservationCreate {
  const text = note.trim()
  return {
    source: 'photo',
    capturedAt,
    lat: pos.lat,
    lng: pos.lng,
    accuracyM: pos.accuracyM,
    chip: null,
    text: text ? text : null,
    photoPath,
  }
}

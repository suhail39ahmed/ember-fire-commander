/**
 * Upload a video clip to the signed URL that ember-api issued.
 *
 * The signed URL path mirrors the photo upload path:
 *   POST /videos/upload-url → { uploadUrl, method, headers, videoPath, expiresAt }
 *   PUT <uploadUrl>         → stores the clip in the private bucket
 *   POST /observations      → video observation with the private videoPath
 */
import type { ObservationDevice, VideoContentType, VideoObservationCreate, UploadUrl } from '../contracts/types'
import type { EmberApi } from '../api/types'
import type { Position } from '../report/buildObservation'
import type { UploadFn, UploadOptions } from '../photo/upload'

/**
 * Ask ember-api for a video signed URL, then PUT the clip to it.
 * Resolves with the private object path.
 */
export async function uploadVideo(
  api: Pick<EmberApi, 'createVideoUploadUrl'>,
  upload: UploadFn,
  clip: Blob,
  contentType: VideoContentType,
  options: UploadOptions = {},
): Promise<string> {
  const target = await api.createVideoUploadUrl(contentType)
  // UploadFn takes UploadUrl. We adapt VideoUploadUrl to that shape; only
  // uploadUrl, method and headers are used by the XHR upload.
  const adapted: UploadUrl = {
    uploadUrl: target.uploadUrl,
    method: target.method,
    headers: target.headers,
    photoPath: target.videoPath,
    expiresAt: target.expiresAt,
  }
  await upload(adapted, clip, options)
  return target.videoPath
}

/**
 * Build a video observation body. Call only after the upload has succeeded.
 */
export function buildVideoObservation(
  videoPath: string,
  capturedAt: string,
  pos: Position,
  device?: ObservationDevice,
  taskId?: string,
): VideoObservationCreate {
  return {
    source: 'video',
    capturedAt,
    lat: pos.lat,
    lng: pos.lng,
    accuracyM: pos.accuracyM,
    chip: null,
    text: null,
    videoPath,
    ...(device ? { device } : {}),
    ...(taskId ? { taskId } : {}),
  }
}

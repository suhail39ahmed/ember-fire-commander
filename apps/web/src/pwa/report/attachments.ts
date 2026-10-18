import { MAX_VIDEO_BYTES, type ObservationCreate, type PhotoContentType, type VideoContentType } from '../contracts/types'
import { isAcceptedImage } from '../photo/preparePhoto'
import type { OutboxBatchEntry } from '../outbox/types'

export const MAX_PHOTOS = 4
export const MAX_VIDEOS = 1

export interface Attachment {
  id: string
  kind: 'photo' | 'video'
  blob: Blob
  contentType: PhotoContentType | VideoContentType
  previewUrl: string
  name: string
}

export function videoType(file: Pick<File, 'type' | 'name'>): VideoContentType | null {
  const mime = file.type.split(';')[0].toLowerCase()
  if (mime === 'video/mp4' || mime === 'video/webm' || mime === 'video/quicktime') return mime
  if (mime && mime !== 'application/octet-stream') return null
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : null
}

export function attachmentProblem(kind: Attachment['kind'], files: readonly File[], current: readonly Attachment[]) {
  if (kind === 'photo') {
    if (current.filter((item) => item.kind === 'photo').length + files.length > MAX_PHOTOS) return 'photoLimit'
    if (files.some((file) => !isAcceptedImage(file))) return 'badPhoto'
  } else {
    if (current.some((item) => item.kind === 'video') || files.length > MAX_VIDEOS) return 'videoLimit'
    if (files.some((file) => !videoType(file))) return 'badVideo'
    if (files.some((file) => file.size <= 0 || file.size > MAX_VIDEO_BYTES)) return 'videoSize'
  }
  return null
}

/** One send action, using existing single-observation APIs and stable outbox ids for every part. */
export function attachmentBatch(body: ObservationCreate, attachments: readonly Attachment[], reportId: string): OutboxBatchEntry[] {
  const pos = { lat: body.lat, lng: body.lng, accuracyM: body.accuracyM }
  const entries: OutboxBatchEntry[] = body.chip || (!attachments.length && body.text)
    ? [{ id: reportId, body, photo: null, video: null }] : []
  for (const item of attachments) {
    const pending = { blob: item.blob, capturedAt: body.capturedAt, pos, taskId: body.taskId, text: body.text, device: body.device }
    entries.push(item.kind === 'photo'
      ? { id: item.id, body: null, photo: { ...pending, contentType: 'image/jpeg' }, video: null }
      : { id: item.id, body: null, photo: null, video: { ...pending, contentType: item.contentType as VideoContentType } })
  }
  return entries
}

/** Wait for the recorder's final data before adding the clip to the gallery attachment list. */
export async function attachRecording(
  recorder: { stopAndTakeClip: () => Promise<Blob | null> },
  stopCamera: () => void,
  add: (kind: 'video', files: File[]) => Promise<Attachment[]>,
): Promise<Attachment[]> {
  const clip = await recorder.stopAndTakeClip()
  stopCamera()
  if (!clip) return []
  const type = clip.type.startsWith('video/mp4') ? 'video/mp4' : 'video/webm'
  return add('video', [new File([clip], `recorded-video.${type === 'video/mp4' ? 'mp4' : 'webm'}`, { type })])
}

import type { ObservationRequest, PhotoContentType, VideoContentType } from '../contracts/types'
import type { Position } from '../report/buildObservation'

export type OutboxState = 'queued' | 'sending' | 'failed' | 'sent'

/** A photo taken offline whose upload has not finished yet. */
export interface PendingPhoto {
  taskId?: string
  blob: Blob
  contentType: PhotoContentType
  capturedAt: string
  pos: Position
}

/** A video clip recorded offline whose upload has not finished yet. */
export interface PendingVideo {
  taskId?: string
  blob: Blob
  contentType: VideoContentType
  capturedAt: string
  pos: Position
}

/**
 * One unsent report, kept in IndexedDB until ember-api stores it.
 * `id` is local to this phone and is never sent to the API.
 */
export interface OutboxItem {
  id: string
  /** The exact body to send. Absent only while a photo or video still has to upload. */
  body: ObservationRequest | null
  photo: PendingPhoto | null
  /** Video clip waiting for upload. Absent on items created before video support existed. */
  video?: PendingVideo | null
  state: OutboxState
  attempts: number
  lastError: string | null
  queuedAt: string
  sentAt: string | null
  observationId: string | null
}

export function capturedAtOf(item: OutboxItem): string {
  return item.body?.capturedAt ?? item.photo?.capturedAt ?? item.video?.capturedAt ?? item.queuedAt
}

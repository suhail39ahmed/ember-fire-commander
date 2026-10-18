import type { ObservationDevice, ObservationRequest, PhotoContentType, VideoContentType } from '../contracts/types'
import type { Position } from '../report/buildObservation'

export type OutboxState = 'queued' | 'sending' | 'failed' | 'sent'

/** All task evidence travels as one durable submission; completion follows all uploads. */
export interface PendingTaskCompletion {
  taskId: string
  capturedAt: string
  entries: OutboxBatchEntry[]
}

/** A photo taken offline whose upload has not finished yet. */
export interface PendingPhoto {
  text?: string | null
  device?: ObservationDevice
  taskId?: string
  blob: Blob
  contentType: PhotoContentType
  capturedAt: string
  pos: Position
}

/** A video clip recorded offline whose upload has not finished yet. */
export interface PendingVideo {
  text?: string | null
  device?: ObservationDevice
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
  taskCompletion?: PendingTaskCompletion
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

/** Stable ids let a partial batch resume without uploading or sending successful items again. */
export type OutboxBatchEntry = Pick<OutboxItem, 'id' | 'body' | 'photo' | 'video'>

export function capturedAtOf(item: OutboxItem): string {
  return item.taskCompletion?.capturedAt ?? item.body?.capturedAt ?? item.photo?.capturedAt ?? item.video?.capturedAt ?? item.queuedAt
}

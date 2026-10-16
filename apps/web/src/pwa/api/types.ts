import type { Digest, Observation, ObservationRequest, PhotoContentType, UploadUrl } from '../contracts/types'

/** Error surfaced to the UI. `retryable` is true for network failures, 429 and 5xx. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
    readonly fields: Record<string, string> = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** The ember-api operations the volunteer PWA uses. */
export interface EmberApi {
  getDigest(): Promise<Digest>
  createObservation(body: ObservationRequest): Promise<Observation>
  /** POST /photos/upload-url: a signed PUT URL for one photo in the private bucket. */
  createUploadUrl(contentType: PhotoContentType): Promise<UploadUrl>
  /** POST /tasks/{id}/heard: this phone showed the task. Sets `heardAt` once; a repeat changes nothing. */
  markTaskHeard(taskId: string): Promise<void>
}

/**
 * PUT one photo to the signed URL that ember-api issued.
 * This is the only browser request that does not go to ember-api. It carries no
 * Firebase token: the signature in the URL is the permission, and it expires.
 */
import type { UploadUrl } from '../contracts/types'

export type UploadErrorKind = 'network' | 'expired' | 'rejected' | 'aborted'

export class UploadError extends Error {
  constructor(
    readonly kind: UploadErrorKind,
    readonly status: number | null,
  ) {
    super(`Upload failed: ${kind}${status ? ` (${status})` : ''}`)
    this.name = 'UploadError'
  }

  /** Network failures and expired URLs are worth retrying with a fresh URL. */
  get retryable(): boolean {
    return this.kind === 'network' || this.kind === 'expired'
  }
}

export interface UploadOptions {
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

export type UploadFn = (target: UploadUrl, blob: Blob, options?: UploadOptions) => Promise<void>

/** Minimal XMLHttpRequest surface; fetch cannot report upload progress. */
export interface XhrLike {
  open(method: string, url: string): void
  setRequestHeader(name: string, value: string): void
  send(body: Blob): void
  abort(): void
  status: number
  upload: { onprogress: ((e: { loaded: number; total: number; lengthComputable: boolean }) => void) | null }
  onload: (() => void) | null
  onerror: (() => void) | null
  onabort: (() => void) | null
  ontimeout: (() => void) | null
  timeout: number
}

const UPLOAD_TIMEOUT_MS = 120_000

export function createXhrUpload(createXhr: () => XhrLike = () => new XMLHttpRequest() as unknown as XhrLike): UploadFn {
  return (target, blob, { onProgress, signal } = {}) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new UploadError('aborted', null))
        return
      }
      const xhr = createXhr()
      xhr.open(target.method, target.uploadUrl)
      for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value)
      xhr.timeout = UPLOAD_TIMEOUT_MS
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total))
      }
      const onAbort = () => xhr.abort()
      signal?.addEventListener('abort', onAbort, { once: true })
      const done = (fn: () => void) => () => {
        signal?.removeEventListener('abort', onAbort)
        fn()
      }
      xhr.onload = done(() => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(1)
          resolve()
        } else if (xhr.status === 400 || xhr.status === 403) {
          // Cloud Storage answers an expired or mismatched signature with 400/403.
          reject(new UploadError('expired', xhr.status))
        } else if (xhr.status >= 500 || xhr.status === 429) {
          reject(new UploadError('network', xhr.status))
        } else {
          reject(new UploadError('rejected', xhr.status))
        }
      })
      xhr.onerror = done(() => reject(new UploadError('network', null)))
      xhr.ontimeout = done(() => reject(new UploadError('network', null)))
      xhr.onabort = done(() => reject(new UploadError('aborted', null)))
      xhr.send(blob)
    })
}

/** Mock upload for VITE_USE_MOCK_API=true: reports progress, sends nothing. */
export function createMockUpload(durationMs = 1200): UploadFn {
  return (_target, _blob, { onProgress, signal } = {}) =>
    new Promise<void>((resolve, reject) => {
      const steps = 6
      let step = 0
      const id = setInterval(() => {
        if (signal?.aborted) {
          clearInterval(id)
          reject(new UploadError('aborted', null))
          return
        }
        step += 1
        onProgress?.(step / steps)
        if (step >= steps) {
          clearInterval(id)
          resolve()
        }
      }, durationMs / steps)
    })
}

import { describe, expect, it, vi } from 'vitest'
import { createHttpApi, ENDPOINTS } from '../../api/client'
import { createMockApi } from '../../api/mock'
import type { UploadUrl } from '../../contracts/types'
import { fitWithin, isAcceptedImage } from '../preparePhoto'
import { createMockUpload, createXhrUpload, UploadError, type XhrLike } from '../upload'
import { buildPhotoObservation, uploadPhoto } from '../uploadPhoto'

const target: UploadUrl = {
  uploadUrl: 'https://storage.googleapis.com/ember-fire-commander-ember-photos/photos/uid_dedi/20261017/a.jpg?X-Goog-Signature=s',
  method: 'PUT',
  headers: { 'Content-Type': 'image/jpeg' },
  photoPath: 'photos/uid_dedi/20261017/a.jpg',
  expiresAt: '2026-10-17T03:05:00Z',
}
const pos = { lat: -1.8492, lng: 110.0508, accuracyM: 15 }
const headers = async () => ({ Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-check' })

function fakeXhr(finish: (x: XhrLike) => void) {
  const calls: { method?: string; url?: string; headers: Record<string, string>; body?: Blob } = { headers: {} }
  const xhr: XhrLike = {
    status: 0,
    timeout: 0,
    upload: { onprogress: null },
    onload: null,
    onerror: null,
    onabort: null,
    ontimeout: null,
    open(method, url) {
      calls.method = method
      calls.url = url
    },
    setRequestHeader(name, value) {
      calls.headers[name] = value
    },
    send(body) {
      calls.body = body
      queueMicrotask(() => finish(xhr))
    },
    abort() {
      xhr.onabort?.()
    },
  }
  return { xhr, calls }
}

describe('signed URL upload', () => {
  it('PUTs the photo with only the signed Content-Type header and reports progress', async () => {
    const { xhr, calls } = fakeXhr((x) => {
      x.upload.onprogress?.({ loaded: 50, total: 100, lengthComputable: true })
      x.status = 200
      x.onload?.()
    })
    const progress: number[] = []
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' })
    await createXhrUpload(() => xhr)(target, blob, { onProgress: (p) => progress.push(p) })
    expect(calls.method).toBe('PUT')
    expect(calls.url).toBe(target.uploadUrl)
    expect(calls.headers).toEqual({ 'Content-Type': 'image/jpeg' })
    expect(calls.headers).not.toHaveProperty('Authorization')
    expect(calls.body).toBe(blob)
    expect(progress).toEqual([0.5, 1])
  })

  it('treats an expired or rejected signature as retryable with a new URL', async () => {
    const { xhr } = fakeXhr((x) => {
      x.status = 403
      x.onload?.()
    })
    const err = await createXhrUpload(() => xhr)(target, new Blob(['x'])).catch((e) => e)
    expect(err).toBeInstanceOf(UploadError)
    expect(err).toMatchObject({ kind: 'expired', status: 403, retryable: true })
  })

  it('maps a dropped connection to a retryable network error', async () => {
    const { xhr } = fakeXhr((x) => x.onerror?.())
    await expect(createXhrUpload(() => xhr)(target, new Blob(['x']))).rejects.toMatchObject({ kind: 'network', retryable: true })
  })

  it('cancels when the signal aborts', async () => {
    const { xhr } = fakeXhr(() => {})
    const controller = new AbortController()
    const pending = createXhrUpload(() => xhr)(target, new Blob(['x']), { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'aborted', retryable: false })
  })

  it('mock upload reports progress to 100%', async () => {
    const progress: number[] = []
    await createMockUpload(6)(target, new Blob(['x']), { onProgress: (p) => progress.push(p) })
    expect(progress[progress.length - 1]).toBe(1)
  })
})

describe('photo flow', () => {
  it('requests a URL from ember-api, uploads, and returns only the private path', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(target), { status: 201 }))
    const api = createHttpApi(headers, 'https://api.example', fetchImpl as unknown as typeof fetch)
    const upload = vi.fn(async () => {})
    const path = await uploadPhoto(api, upload, new Blob(['x']), 'image/jpeg')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.example${ENDPOINTS.photoUploadUrl}`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ contentType: 'image/jpeg' })
    expect(upload).toHaveBeenCalledWith(target, expect.any(Blob), {})
    expect(path).toBe(target.photoPath)
    expect(path).not.toMatch(/^https?:/)
  })

  it('does not return a path when the upload fails', async () => {
    const api = { createUploadUrl: async () => target }
    const upload = vi.fn(async () => {
      throw new UploadError('network', null)
    })
    await expect(uploadPhoto(api, upload, new Blob(['x']), 'image/jpeg')).rejects.toBeInstanceOf(UploadError)
  })

  it('builds a source photo observation with the capture time and no severity', () => {
    const body = buildPhotoObservation(target.photoPath, '2026-10-17T03:02:00Z', pos, '  ')
    expect(body).toEqual({
      source: 'photo',
      capturedAt: '2026-10-17T03:02:00Z',
      lat: pos.lat,
      lng: pos.lng,
      accuracyM: 15,
      chip: null,
      text: null,
      photoPath: target.photoPath,
    })
    expect(body).not.toHaveProperty('severity')
    expect(body).not.toHaveProperty('id')
  })

  it('mock api stores the photo path and refuses another volunteer path', async () => {
    const api = createMockApi('uid_dedi', 0)
    const issued = await api.createUploadUrl('image/jpeg')
    const stored = await api.createObservation(buildPhotoObservation(issued.photoPath, '2026-10-17T03:02:00Z', pos))
    expect(stored).toMatchObject({ source: 'photo', photoPath: issued.photoPath, severity: 'unknown' })
    const other = buildPhotoObservation('photos/uid_sari/mock/x.jpg', '2026-10-17T03:02:00Z', pos)
    await expect(api.createObservation(other)).rejects.toMatchObject({ status: 400, fields: { photoPath: expect.any(String) } })
  })
})

describe('photo preparation', () => {
  it('scales the long edge down to 1600 px and keeps small photos as they are', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('accepts images only, up to 25 MB', () => {
    expect(isAcceptedImage({ type: 'image/jpeg', size: 1000 })).toBe(true)
    expect(isAcceptedImage({ type: 'video/mp4', size: 1000 })).toBe(false)
    expect(isAcceptedImage({ type: 'image/jpeg', size: 0 })).toBe(false)
    expect(isAcceptedImage({ type: 'image/jpeg', size: 26 * 1024 * 1024 })).toBe(false)
  })
})

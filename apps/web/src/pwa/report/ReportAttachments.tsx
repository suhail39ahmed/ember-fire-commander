import { useEffect, useRef, useState } from 'react'
import { t, type Lang } from '../i18n'
import { MAX_PHOTOS, type Attachment } from './attachments'
import { attachmentStrings as s } from './attachmentStrings'
import type { useReportAttachments } from './useReportAttachments'
import './attachments.css'

export function ReportAttachments({ lang, media, disabled, onVideoAdded }: { lang: Lang; media: ReturnType<typeof useReportAttachments>; disabled: boolean; onVideoAdded?: () => void }) {
  const [source, setSource] = useState<Attachment['kind'] | null>(null)
  useEffect(() => { if (disabled) setSource(null) }, [disabled])
  const photoCamera = useRef<HTMLInputElement>(null)
  const videoCamera = useRef<HTMLInputElement>(null)
  const photoGallery = useRef<HTMLInputElement>(null)
  const videoGallery = useRef<HTMLInputElement>(null)
  const locked = disabled || media.busy
  const photos = media.items.filter((item) => item.kind === 'photo').length
  const videos = media.items.filter((item) => item.kind === 'video').length
  const acceptVideo = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'
  const onFiles = (kind: Attachment['kind'], input: HTMLInputElement) => {
    const files = Array.from(input.files ?? [])
    input.value = ''
    setSource(null)
    if (!locked) void media.add(kind, files).then((added) => { if (kind === 'video' && added.length) onVideoAdded?.() })
  }
  function open(camera: boolean) {
    if (locked) return
    const kind = source
    setSource(null)
    if (camera) {
      const captureInput = kind === 'photo' ? photoCamera : videoCamera
      captureInput.current?.click()
    } else (kind === 'photo' ? photoGallery : videoGallery).current?.click()
  }
  return <section className="report-attachments" aria-label={t(lang, s.label)}>
    <p className="section-label">{t(lang, s.label)}</p>
    <input ref={photoCamera} type="file" accept="image/*" capture="environment" className="attachment-input" tabIndex={-1} aria-hidden="true" disabled={locked} onChange={(e) => onFiles('photo', e.target)} />
    <input ref={videoCamera} type="file" accept="video/*" capture="environment" className="attachment-input" tabIndex={-1} aria-hidden="true" disabled={locked} onChange={(e) => onFiles('video', e.target)} />
    <input ref={photoGallery} type="file" accept="image/*" multiple className="attachment-input" tabIndex={-1} aria-hidden="true" disabled={locked} onChange={(e) => onFiles('photo', e.target)} />
    <input ref={videoGallery} type="file" accept={acceptVideo} className="attachment-input" tabIndex={-1} aria-hidden="true" disabled={locked} onChange={(e) => onFiles('video', e.target)} />
    <div className="attachment-tiles">
      <button type="button" className="attachment-tile" disabled={locked || videos === 1} aria-expanded={source === 'video'} aria-controls="attachment-source" onClick={() => setSource(source === 'video' ? null : 'video')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="3" /><path d="m15 10 6-3v10l-6-3" /></svg>
        <strong>{t(lang, s.video)}</strong><span>{videos ? '1 / 1' : t(lang, s.upToOne)}</span>
      </button>
      <button type="button" className="attachment-tile" disabled={locked || photos === MAX_PHOTOS} aria-expanded={source === 'photo'} aria-controls="attachment-source" onClick={() => setSource(source === 'photo' ? null : 'photo')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><circle cx="9" cy="9" r="1.5" /><path d="m5 17 5-5 3 3 3-4 4 5" /></svg>
        <strong>{t(lang, s.photos)}</strong><span>{photos ? `${photos} / 4` : t(lang, s.upToFour)}</span>
      </button>
    </div>
    {source && !locked && <div id="attachment-source" className="attachment-source" role="group" aria-label={t(lang, source === 'photo' ? s.photos : s.video)}>
      <button type="button" className="btn secondary" onClick={() => open(true)}>{t(lang, source === 'photo' ? s.take : s.record)}</button>
      <button type="button" className="btn secondary" onClick={() => open(false)}>{t(lang, s.gallery)}</button>
      <button type="button" className="attachment-cancel" onClick={() => setSource(null)}>{t(lang, s.cancel)}</button>
      {source === 'video' && <p className="muted small">{t(lang, s.videoHint)}</p>}
    </div>}
    {media.items.length > 0 && <ul className="attachment-previews" aria-label={lang === 'en' ? 'Selected attachments' : 'Lampiran terpilih'}>{media.items.map((item, index) => <li key={item.id}>
      {item.kind === 'photo' ? <img src={item.previewUrl} alt={`${t(lang, s.photos)} ${index + 1}`} /> : <video src={item.previewUrl} controls playsInline preload="metadata" />}
      <button type="button" disabled={locked} aria-label={`${t(lang, s.remove)} ${item.name}`} onClick={() => media.remove(item.id)}>×</button>
      <span>{item.name}</span>
    </li>)}</ul>}
    {media.busy && <p className="muted small" role="status">{t(lang, s.preparing)}</p>}
    {media.error && <p className="error" role="alert">{t(lang, s[media.error])}</p>}
  </section>
}

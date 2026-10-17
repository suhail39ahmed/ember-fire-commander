import { useEffect, useRef, useState } from 'react'
import type { TrainingPayload } from '../contracts/types'
import { t, type Lang } from '../i18n'
import { screenStrings } from './strings'
import { youtubeId } from './trainingVideoUrl'

interface Player {
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  getIframe(): HTMLIFrameElement
  destroy(): void
}
interface YouTube {
  Player: new (element: HTMLElement, options: {
    videoId: string; host: string; playerVars: Record<string, string | number>
    events: { onReady: (event: { target: Player }) => void; onStateChange: (event: { target: Player; data: number }) => void; onError: () => void }
  }) => Player
}
let youtubeReady: Promise<YouTube> | null = null
function loadYouTube(): Promise<YouTube> {
  const browser = window as unknown as { YT?: YouTube; onYouTubeIframeAPIReady?: () => void }
  if (browser.YT?.Player) return Promise.resolve(browser.YT)
  if (!youtubeReady) youtubeReady = new Promise<YouTube>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('player unavailable')), 15000)
    const previous = browser.onYouTubeIframeAPIReady
    browser.onYouTubeIframeAPIReady = () => { previous?.(); clearTimeout(timeout); if (browser.YT) resolve(browser.YT) }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('player unavailable')) }
    document.head.append(script)
  }).catch((error: unknown) => { youtubeReady = null; throw error })
  return youtubeReady
}
export function TrainingVideo({ video, lang, volunteerId, online, save, onComplete }: {
  video: TrainingPayload['video']; lang: Lang; volunteerId: string | null; online: boolean
  save: (position: number) => Promise<void>
  onComplete?: () => void
}) {
  const s = screenStrings.guide
  const storageKey = `ember:training:${volunteerId}:${video.id}:${video.url}`
  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved !== null && Number.isFinite(Number(saved)) ? Math.max(0, Number(saved)) : video.progressSec
    } catch { return video.progressSec }
  })
  const [duration, setDuration] = useState(video.durationSec)
  const [failed, setFailed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [ended, setEnded] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const resume = useRef(position)
  const lastSaved = useRef(-10)
  const pending = useRef(false)
  const saveRef = useRef(save)
  saveRef.current = save
  const onlineRef = useRef(online)
  onlineRef.current = online
  function remember(seconds: number, force = false) {
    if (!Number.isFinite(seconds)) return
    const next = Math.max(0, Math.floor(seconds))
    setPosition(next); resume.current = next
    try { localStorage.setItem(storageKey, String(next)) } catch { /* Playback works without storage. */ }
    if (onlineRef.current && !pending.current && (force || Math.abs(next - lastSaved.current) >= 10)) {
      pending.current = true
      void saveRef.current(next).then(() => { lastSaved.current = next; setSaveFailed(false) })
        .catch(() => setSaveFailed(true)).finally(() => { pending.current = false })
    }
  }
  const rememberRef = useRef(remember)
  rememberRef.current = remember
  const id = video.url ? youtubeId(video.url) : null
  useEffect(() => {
    if (!id || !host.current || !online) return
    let cancelled = false
    let player: Player | null = null
    let timer: number | undefined
    const target = document.createElement('div')
    host.current.replaceChildren(target)
    setFailed(false)
    void loadYouTube().then((youtube) => {
      if (cancelled) return
      player = new youtube.Player(target, {
        videoId: id, host: 'https://www.youtube-nocookie.com',
        playerVars: { playsinline: 1, rel: 0, origin: window.location.origin, start: Math.floor(resume.current) },
        events: {
          onReady: ({ target: ready }) => {
            if (cancelled) return
            ready.getIframe().title = 'Training video'
            timer = window.setInterval(() => {
              const length = ready.getDuration()
              if (length > 0) setDuration(length)
              if (ready.getPlayerState() === 1) rememberRef.current(ready.getCurrentTime())
            }, 1000)
          },
          onStateChange: ({ target: current, data }) => {
            if (data === 2 || data === 0) rememberRef.current(current.getCurrentTime(), true)
            if (data === 0) setEnded(true)
          },
          onError: () => setFailed(true),
        },
      })
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true; window.clearInterval(timer); player?.destroy() }
  }, [id, online, retry])
  const format = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  return <section className="card guide-video">
    {id ? <div className="training-player" ref={host} /> : video.url ? <video className="training-player" controls playsInline preload="metadata" src={video.url}
      onLoadedMetadata={(event) => { const player = event.currentTarget; if (Number.isFinite(player.duration)) setDuration(player.duration); player.currentTime = Math.min(resume.current, player.duration || resume.current) }}
      onTimeUpdate={(event) => remember(event.currentTarget.currentTime)} onPause={(event) => remember(event.currentTarget.currentTime, true)} onEnded={() => setEnded(true)} onError={() => setFailed(true)} />
      : <p className="muted">{t(lang, s.videoUnavailable)}</p>}
    {id && !online && <p className="muted small">{t(lang, s.videoNeedsSignal)}</p>}
    {failed && <p className="error" role="alert">{t(lang, s.videoUnavailable)} <button type="button" className="guide-text-button" onClick={() => setRetry((value) => value + 1)}>{t(lang, s.retry)}</button></p>}
    <div className="guide-video-meta"><span className="guide-start-label">{t(lang, s.startHere)} · {Math.ceil(duration / 60)} {t(lang, s.min)}</span><span className="guide-time">{format(position)} / {format(duration)}</span></div>
    <strong>{t(lang, video.title)}</strong>
    <progress className="guide-progress" aria-label={t(lang, s.videoProgress)} max={Math.max(1, duration)} value={Math.min(position, duration)} />
    <p className="muted small">{t(lang, s.afterVideo)}</p>
    {ended && onComplete && <button type="button" className="guide-chip" disabled={!online} onClick={onComplete}>{t(lang, s.checkLearning)}</button>}
    {saveFailed && <p className="error" role="status">{t(lang, s.saveFailed)}</p>}
  </section>
}


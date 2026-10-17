import { useEffect, useRef, useState } from 'react'
import { t, type Lang } from '../i18n'
import { screenStrings } from './strings'

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

export function PracticeComposer({ lang, placeholder, disabled, onSend }: {
  lang: Lang; placeholder: string; disabled: boolean; onSend: (text: string) => void
}) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [error, setError] = useState(false)
  const recognition = useRef<Recognition | null>(null)
  const s = screenStrings.practice
  useEffect(() => () => { recognition.current?.abort() }, [])
  useEffect(() => { if (disabled) recognition.current?.abort() }, [disabled])

  function dictate() {
    if (listening) { recognition.current?.abort(); return }
    const browser = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition
    if (!Constructor) { setError(true); return }
    const next = new Constructor()
    recognition.current = next
    next.lang = lang === 'id' ? 'id-ID' : 'en-US'
    next.continuous = false
    next.interimResults = false
    next.onresult = (event) => { setText(event.results[0][0].transcript); setError(false) }
    next.onerror = () => { setError(true); setListening(false) }
    next.onend = () => setListening(false)
    try { next.start(); setListening(true); setError(false) } catch { setError(true); setListening(false) }
  }

  return <>
    <form className="practice-composer" onSubmit={(event) => { event.preventDefault(); if (text.trim() && !disabled) { onSend(text.trim()); setText('') } }}>
      <input aria-label={placeholder} placeholder={placeholder} value={text} maxLength={500} onChange={(event) => setText(event.target.value)} disabled={disabled} />
      {text.trim() ? <button type="submit" className="composer-action" disabled={disabled} aria-label={t(lang, s.ask)}>↑</button>
        : <button type="button" className="composer-action" disabled={disabled} onClick={dictate} aria-label={t(lang, listening ? s.stopListening : s.microphone)} aria-pressed={listening}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>
        </button>}
    </form>
    {listening && <p className="muted small" role="status">{t(lang, s.listening)}</p>}
    {error && <p className="error" role="status">{t(lang, s.couldNotHear)}</p>}
  </>
}

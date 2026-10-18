import { useLayoutEffect, useRef } from 'react'
import type { TranscriptLine } from './transcriptionStream'

export function TranscriptLog({ lines }: { lines: TranscriptLine[] }) {
  const log = useRef<HTMLOListElement>(null)
  useLayoutEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }, [lines])

  return <ol ref={log} className="call-transcription-log" role="log" aria-label="Spoken transcript"
    aria-live="polite" aria-relevant="additions text" tabIndex={0}>
    {lines.map((line, index) => <li key={line.segmentId ?? index}>
      {line.timestamp && <time className="transcript-time" dateTime={line.timestamp}>{new Date(line.timestamp).toLocaleTimeString()}</time>}
      <strong>{line.name}: </strong>{line.text}{!line.finished && <span className="small"> …</span>}
    </li>)}
  </ol>
}

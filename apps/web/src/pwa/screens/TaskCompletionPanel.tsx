import { useEffect, useRef, useState } from 'react'
import type { ChipValue, Task } from '../contracts/types'
import { useVolunteer } from '../layout/volunteerContext'
import { useLanguage } from '../language'
import { ReportAttachments } from '../report/ReportAttachments'
import { useReportAttachments } from '../report/useReportAttachments'
import { attachmentBatch } from '../report/attachments'
import { ChipRow } from '../report/ChipRow'
import { buildObservation, MAX_NOTE_LENGTH } from '../report/buildObservation'
import { locate } from '../report/location'
import { stampNow } from '../clock'
import { OutboxPanel } from '../outbox/OutboxPanel'
import './reportScreen.css'

/** Task evidence is held until submission, then saved with completion in one API transaction. */
export function TaskCompletionPanel({ task }: { task: Task }) {
  const { lang } = useLanguage()
  const { outbox, refresh } = useVolunteer()
  const media = useReportAttachments()
  const [chip, setChip] = useState<ChipValue | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const lock = useRef(false)
  const submissionId = useRef<string | null>(null)
  const sendButton = useRef<HTMLButtonElement>(null)
  const [scrollToSend, setScrollToSend] = useState(0)
  const pending = outbox.items.find((item) => item.taskCompletion?.taskId === task.id)
  const locked = busy || Boolean(pending)
  const en = lang === 'en'
  useEffect(() => { if (scrollToSend) sendButton.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [scrollToSend])
  const refreshed = useRef(false)
  useEffect(() => {
    if (pending?.state === 'sent' && !refreshed.current) { refreshed.current = true; refresh() }
  }, [pending?.state, refresh])

  async function submit() {
    if (lock.current || media.busy || !outbox.submitTask) return
    lock.current = true
    setBusy(true)
    setError(null)
    try {
      let result: 'sent' | 'queued'
      if (pending?.taskCompletion) result = await outbox.submitTask(pending.id, pending.taskCompletion)
      else {
        const attachments = media.items
        const location = await locate()
        if (location.kind !== 'ok') throw new Error(en ? 'Allow location to submit these task details.' : 'Izinkan lokasi untuk mengirim rincian tugas.')
        const capturedAt = stampNow()
        submissionId.current ??= crypto.randomUUID()
        const body = buildObservation({ chip, text: note, capturedAt }, location.pos, task.id)
        result = await outbox.submitTask(submissionId.current, { taskId: task.id, capturedAt, entries: attachmentBatch(body, attachments, submissionId.current) })
      }
      media.clear()
      if (result === 'sent') { setSent(true); refresh() }
    } catch (cause) { setError(cause instanceof Error ? cause.message : (en ? 'Could not submit task details.' : 'Rincian tugas gagal dikirim.')) }
    finally { lock.current = false; setBusy(false) }
  }

  if (sent || pending?.state === 'sent') return <p className="notice ok" role="status">{en ? 'Task completed. Your supervisor has the details.' : 'Tugas selesai. Supervisor telah menerima rinciannya.'}</p>
  return <section className="report-form-content report-upload-layout">
    <h3 id="task-details-label" className="section-label">{en ? 'Task details' : 'Rincian tugas'}</h3>
    <p className="muted small">{en ? 'Submit your findings and attachments when the task is finished.' : 'Kirim temuan dan lampiran setelah tugas selesai.'}</p>
    {!pending && <>
      <div className="report"><ChipRow lang={lang} value={chip} disabled={locked} labelledBy="task-details-label" invalid={false} onChange={setChip} /></div>
      <ReportAttachments lang={lang} media={media} disabled={locked} onVideoAdded={() => setScrollToSend((n) => n + 1)} />
      <label htmlFor="task-completion-note">{en ? 'Task note (optional)' : 'Catatan tugas (opsional)'}</label>
      <textarea id="task-completion-note" className="text-field" value={note} disabled={locked} maxLength={MAX_NOTE_LENGTH} onChange={(event) => setNote(event.target.value)} />
    </>}
    {pending && <><p className="notice" role="status">{en ? 'Task completion is pending until all details are received.' : 'Penyelesaian tugas menunggu semua rincian diterima.'}</p><OutboxPanel items={[pending]} online={outbox.online} lang={lang} onRetry={(id) => void outbox.retry(id)} onDiscard={async (id) => { await outbox.discard(id); submissionId.current = null }} /></>}
    {error && <p className="error" role="alert">{error}</p>}
    <button ref={sendButton} type="button" className="btn primary" disabled={busy || media.busy || pending?.state === 'sending' || (!pending && !chip && !note.trim() && !media.items.length)} onClick={() => void submit()}>
      {busy ? (en ? 'Submitting task…' : 'Mengirim tugas…') : (en ? 'Submit & complete task' : 'Kirim & selesaikan tugas')}
    </button>
  </section>
}

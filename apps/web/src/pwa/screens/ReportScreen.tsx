import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { OutboxPanel } from '../outbox/OutboxPanel'
import { ReportPanel } from '../report/ReportPanel'
import { locate, watchLocationGranted } from '../report/location'
import type { ChipValue, ObservationCreate } from '../contracts/types'
import { ReportAttachments } from '../report/ReportAttachments'
import { useReportAttachments } from '../report/useReportAttachments'
import { attachmentBatch } from '../report/attachments'
import { attachmentStrings } from '../report/attachmentStrings'
import { ApiError } from '../api/types'
import { t } from '../i18n'
import { incidentLabelById } from '../incidentName'
import { screenStrings } from './strings'
import type { SubmitResult } from '../outbox/useOutbox'
import './reportScreen.css'

/** Standalone report form; TaskScreen uses its own atomic task completion submission. */
export function ReportScreen({ taskContext, children, onBack }: {
  taskContext?: { taskId: string; incidentId: string }
  children?: ReactNode
  onBack?: () => void
} = {}) {
  const { lang } = useLanguage()
  const { api, volunteerId, outbox, digest, refresh, position } = useVolunteer()
  const navigate = useNavigate()
  const routeState = useLocation().state as { chip?: ChipValue | null; n?: number; incidentId?: string; taskId?: string } | null
  const state = taskContext ? { ...taskContext, chip: undefined } : routeState
  const preset = state && state.chip !== undefined ? { chip: state.chip, n: state.n ?? 1 } : undefined
  const media = useReportAttachments()
  const batchId = useRef<string | null>(null)
  const pageTop = useRef<HTMLElement>(null)
  const sendButton = useRef<HTMLButtonElement>(null)
  const [scrollToSend, setScrollToSend] = useState(0)
  const copy = screenStrings.report

  async function submitAttachments(body: ObservationCreate): Promise<SubmitResult> {
    if (!outbox.submitBatch) throw new ApiError('unavailable', 'Media uploads are unavailable. Reload and try again.', null, false)
    const attachments = media.items
    if (!attachments.length && !body.chip && !body.text) throw new ApiError('empty', 'Add report details or select an attachment.', 400, false)
    batchId.current ??= crypto.randomUUID()
    // Keep all parts of a task update linked, including captured clips and gallery media.
    const linkedBody = state?.taskId ? { ...body, taskId: state.taskId } : body
    return outbox.submitBatch(attachmentBatch(linkedBody, attachments, batchId.current))
  }

  useEffect(() => {
    if (scrollToSend) sendButton.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [scrollToSend])

  const mediaUploads = outbox.items.filter((item) => item.photo || item.video || item.body?.source === 'photo' || item.body?.source === 'video')
  const pendingItems = taskContext ? outbox.items : mediaUploads
  const uploadOutbox = pendingItems.length > 0 ? <OutboxPanel
    items={pendingItems}
    online={outbox.online}
    lang={lang}
    onRetry={(id) => void outbox.retry(id)}
    onDiscard={(id) => void outbox.discard(id)}
    onSendNow={taskContext ? () => void outbox.flush() : undefined}
  /> : null

  return <>
    <header ref={pageTop} className="report-page-header">
      <div className="report-heading-title">{onBack && <button type="button" className="back" onClick={onBack} aria-label={t(lang, screenStrings.common.back)}>←</button>}<div>{!taskContext && <p className="report-eyebrow">{t(lang, copy.fieldReport)}</p>}<h1>{t(lang, taskContext ? screenStrings.task.title : copy.reportFire)}</h1></div></div>
    </header>
    {children}
    {position.kind === 'ok' && <p className="report-location-pill"><span aria-hidden="true">●</span> ±{Math.round(position.accuracyM)} m</p>}
    <div className="report-form-content report-upload-layout">
      {!taskContext && state?.incidentId && <p className="muted small" data-testid="report-context">
        {t(lang, screenStrings.report.forIncident)} {incidentLabelById(state.incidentId, digest?.incidents)}
      </p>}
      {!taskContext && state?.taskId && <p className="muted small" data-testid="report-task-context">
        {t(lang, screenStrings.report.forTask)} {digest?.myTasks.find((x) => x.id === state.taskId)?.instruction ?? ''}
      </p>}
      <ReportPanel
        api={api}
        lang={lang}
        heading={t(lang, copy.whatDoYouSee)}
        media={(disabled) => <ReportAttachments lang={lang} media={media} disabled={disabled} onVideoAdded={() => setScrollToSend((n) => n + 1)} />}
        hasAttachments={media.items.length > 0}
        mediaBusy={media.busy}
        onMediaSent={() => { media.clear(); batchId.current = null; refresh() }}
        idleHint={t(lang, attachmentStrings.location)}
        outbox={uploadOutbox}
        sendButtonRef={sendButton}
        locate={locate}
        onLocationGranted={watchLocationGranted}
        preset={preset}
        taskId={state?.taskId}
        submit={submitAttachments}
        volunteerId={volunteerId}
        onDone={() => navigate('/pwa')}
      />
    </div>
  </>
}

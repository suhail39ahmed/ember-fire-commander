import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { CameraPanel } from '../camera/CameraPanel'
import { useLiveCamera } from '../camera/useLiveCamera'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { OutboxPanel } from '../outbox/OutboxPanel'
import { ReportPanel } from '../report/ReportPanel'
import { locate, watchLocationGranted } from '../report/location'
import type { ChipValue, ObservationCreate } from '../contracts/types'
import { ReportAttachments } from '../report/ReportAttachments'
import { useReportAttachments } from '../report/useReportAttachments'
import { attachmentBatch, attachRecording } from '../report/attachments'
import { attachmentStrings } from '../report/attachmentStrings'
import { ApiError } from '../api/types'
import { t } from '../i18n'
import { incidentLabelById } from '../incidentName'
import { screenStrings } from './strings'
import type { SubmitResult } from '../outbox/useOutbox'
import './reportScreen.css'

/** Shared photo, video and notes form for standalone reports and task updates. */
export function ReportScreen({ taskContext, children, onBack }: {
  taskContext?: { taskId: string; incidentId: string }
  children?: ReactNode
  onBack?: () => void
} = {}) {
  const { lang } = useLanguage()
  const { api, volunteerId, outbox, talk, digest, refresh, position } = useVolunteer()
  const navigate = useNavigate()
  const routeState = useLocation().state as { chip?: ChipValue | null; n?: number; incidentId?: string; taskId?: string } | null
  const state = taskContext ? { ...taskContext, chip: undefined } : routeState
  const preset = state && state.chip !== undefined ? { chip: state.chip, n: state.n ?? 1 } : undefined
  const camera = useLiveCamera()
  const media = useReportAttachments()
  const batchId = useRef<string | null>(null)
  const [videoOpen, setVideoOpen] = useState(false)
  const [stoppingVideo, setStoppingVideo] = useState(false)
  const stopInProgress = useRef(false)
  const [recordError, setRecordError] = useState(false)
  const pageTop = useRef<HTMLElement>(null)
  const sendButton = useRef<HTMLButtonElement>(null)
  const [scrollToSend, setScrollToSend] = useState(0)
  const copy = screenStrings.report

  async function addRecordedVideo() {
    const added = await attachRecording(camera.recorder, camera.stop, media.add)
    if (added.length) setVideoOpen(false)
    else setRecordError(true)
    return added
  }

  async function stopRecording() {
    if (stopInProgress.current) return
    stopInProgress.current = true
    setStoppingVideo(true)
    try {
      const added = await addRecordedVideo()
      if (added.length) setScrollToSend((request) => request + 1)
    }
    finally { stopInProgress.current = false; setStoppingVideo(false) }
  }

  async function submitAttachments(body: ObservationCreate): Promise<SubmitResult> {
    if (!outbox.submitBatch) throw new ApiError('unavailable', 'Media uploads are unavailable. Reload and try again.', null, false)
    let attachments = media.items
    if (camera.recorderSnap.recording || camera.recorderSnap.clip) {
      const added = await addRecordedVideo()
      if (!added.length) throw new ApiError('invalid_video', t(lang, attachmentStrings.videoSize), 400, false)
      attachments = [...attachments, ...added]
    }
    if (!attachments.length && !body.chip && !body.text) throw new ApiError('empty', 'No video was recorded. Try recording again.', 400, false)
    batchId.current ??= crypto.randomUUID()
    // Keep all parts of a task update linked, including captured clips and gallery media.
    const linkedBody = state?.taskId ? { ...body, taskId: state.taskId } : body
    return outbox.submitBatch(attachmentBatch(linkedBody, attachments, batchId.current))
  }

  useEffect(() => {
    if (videoOpen) pageTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [videoOpen])

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

  // Preserve the shared recorder's microphone connection when voice is active.
  useEffect(() => {
    camera.recorder.setMicStream(talk.micStream)
  }, [camera.recorder, talk.micStream])

  useEffect(() => {
    return () => camera.recorder.discard()
  }, [camera.recorder])

  return <>
    <header ref={pageTop} className="report-page-header">
      <div className="report-heading-title">{onBack && <button type="button" className="back" onClick={onBack} aria-label={t(lang, screenStrings.common.back)}>←</button>}<div>{!taskContext && <p className="report-eyebrow">{t(lang, copy.fieldReport)}</p>}<h1>{t(lang, taskContext ? screenStrings.task.title : copy.reportFire)}</h1></div></div>
    </header>
    {children}
    {position.kind === 'ok' && <p className="report-location-pill"><span aria-hidden="true">●</span> ±{Math.round(position.accuracyM)} m</p>}
    <section id="report-live-panel" className="report-live-panel" hidden={!videoOpen} aria-label={t(lang, attachmentStrings.record)}>
      <div className="report-live-heading"><h2>{t(lang, attachmentStrings.record)}</h2>
        <button type="button" className="report-tool report-record-stop" disabled={stoppingVideo || (!camera.recorderSnap.recording && !camera.recorderSnap.clip)} onClick={() => void stopRecording()}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>{t(lang, stoppingVideo ? attachmentStrings.stopping : attachmentStrings.stop)}</button>
        <button type="button" className="report-live-close" disabled={stoppingVideo} onClick={() => { camera.stop(); camera.recorder.discard(); setVideoOpen(false); setRecordError(false) }}>{t(lang, attachmentStrings.cancel)}</button>
      </div>
      <CameraPanel
        lang={lang}
        state={camera.state}
        stream={camera.stream}
        onToggle={camera.toggle}
        accuracyM={position.kind === 'ok' ? position.accuracyM : null}
        onBack={onBack ?? (() => navigate('/pwa'))}
        framesToCoach={false}
        recorderSnap={camera.recorderSnap}
        stopAction={{ label: t(lang, stoppingVideo ? attachmentStrings.stopping : attachmentStrings.stop), onStop: () => void stopRecording(), busy: stoppingVideo }}
      />
      {recordError && <p className="error" role="alert">{t(lang, attachmentStrings.recordFailed)}</p>}
    </section>
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
        media={(disabled) => <ReportAttachments lang={lang} media={media} disabled={disabled || stoppingVideo} recording={videoOpen || camera.recorderSnap.recording || Boolean(camera.recorderSnap.clip)} onRecordVideo={() => { setRecordError(false); setVideoOpen(true); camera.start() }} />}
        hasAttachments={media.items.length > 0 || camera.recorderSnap.recording || Boolean(camera.recorderSnap.clip)}
        mediaBusy={media.busy || stoppingVideo}
        onMediaSent={() => { media.clear(); batchId.current = null; camera.stop(); camera.recorder.discard(); setVideoOpen(false); refresh() }}
        idleHint={t(lang, attachmentStrings.location)}
        outbox={uploadOutbox}
        sendButtonRef={sendButton}
        locate={locate}
        onLocationGranted={watchLocationGranted}
        preset={preset}
        taskId={state?.taskId}
        submit={submitAttachments}
        volunteerId={volunteerId}
        onDone={() => taskContext ? (camera.stop(), setVideoOpen(false)) : navigate('/pwa')}
      />
    </div>
  </>
}

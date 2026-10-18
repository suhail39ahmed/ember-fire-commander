import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { CameraPanel } from '../camera/CameraPanel'
import { useLiveCamera } from '../camera/useLiveCamera'
import { CoachReceipt, CoachReply } from '../gateway/CoachReply'
import { HoldToTalkPanel } from '../gateway/HoldToTalkPanel'
import { gatewayStrings } from '../gateway/gatewayStrings'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { OutboxPanel } from '../outbox/OutboxPanel'
import { PhotoPanel } from '../photo/PhotoPanel'
import { ReportPanel } from '../report/ReportPanel'
import { getPosition, locate, watchLocationGranted } from '../report/location'
import { stampNow } from '../clock'
import type { ChipValue, ObservationRequest, PhotoObservationCreate, VideoContentType } from '../contracts/types'
import { t } from '../i18n'
import { incidentLabelById } from '../incidentName'
import { screenStrings } from './strings'
import type { SubmitResult } from '../outbox/useOutbox'
import './reportScreen.css'

/** Quick cards and photo reporting first; existing video and voice tools open on demand. */
export function ReportScreen({ taskContext, children, onBack }: {
  taskContext?: { taskId: string; incidentId: string }
  children?: ReactNode
  onBack?: () => void
} = {}) {
  const { lang } = useLanguage()
  const { api, volunteerId, outbox, upload, talk, digest, refresh, position } = useVolunteer()
  const navigate = useNavigate()
  const routeState = useLocation().state as { chip?: ChipValue | null; n?: number; incidentId?: string; taskId?: string } | null
  const state = taskContext ? { ...taskContext, chip: undefined } : routeState
  const preset = state && state.chip !== undefined ? { chip: state.chip, n: state.n ?? 1 } : undefined
  const [voiceNote, setVoiceNote] = useState<string | null>(null)
  const camera = useLiveCamera()

  // Holds the stopAndTakeClip() promise started by onBeforePhotoCapture so that
  // the photo submit path can await the clip without a second stop() call.
  const pendingClipRef = useRef<Promise<Blob | null> | null>(null)

  const [videoOpen, setVideoOpen] = useState(() => talk.coach.phase !== 'idle')
  const [callOpen, setCallOpen] = useState(false)
  const voiceActive = talk.view.button === 'listening' || talk.view.button === 'connecting'
  const livePanelOpen = videoOpen || callOpen || voiceActive || talk.view.button === 'replying'
  const copy = screenStrings.report

  function toggleVideo() {
    if (videoOpen) camera.stop()
    else camera.start()
    setVideoOpen((open) => !open)
  }

  // Connect / disconnect the microphone from Hold to Talk to the video recorder.
  // When HtT goes live, talk.micStream becomes non-null and is mixed into the recording.
  // When released, it becomes null and silence is recorded again.
  useEffect(() => {
    camera.recorder.setMicStream(talk.micStream)
  }, [camera.recorder, talk.micStream])

  // Discard any unsent clip when the volunteer leaves the screen without pressing Send.
  // discard() is a no-op while stopAndTakeClip() is pending, so in-flight clips are safe.
  useEffect(() => {
    return () => camera.recorder.discard()
  }, [camera.recorder])

  /**
   * Stop the recording, take the clip, and enqueue a separate video observation.
   * Shared by every send path that can have a clip in-flight.
   */
  async function enqueueClipIfPresent(clip: Blob | null): Promise<void> {
    if (!clip) return
    const mimeType = camera.recorder.getSnapshot().mimeType
    if (!mimeType) return
    const pos = await getPosition()
    if (!pos) return
    const contentType: VideoContentType = mimeType.startsWith('video/mp4') ? 'video/mp4' : 'video/webm'
    try {
      await outbox.submitVideo?.({ blob: clip, contentType, capturedAt: stampNow(), pos, ...(state?.taskId ? { taskId: state.taskId } : {}) })
    } catch {
      // Submission failed (e.g. upload error retryable later); keep the clip in the outbox.
      try {
        await outbox.queueVideo?.({ blob: clip, contentType, capturedAt: stampNow(), pos, ...(state?.taskId ? { taskId: state.taskId } : {}) })
      } catch {
        // Storage unavailable; the clip cannot be kept.
      }
    }
  }

  async function onRelease() {
    const text = talk.takeTranscript()
    talk.onRelease()
    if (!text) {
      // No invented words when the gateway sent nothing (browser handshake is still undecided).
      return
    }
    setVoiceNote(null)

    // Stop the recording and take the clip before awaiting the position so the
    // browser has time to flush buffered data while we wait for the GPS fix.
    const clipPromise = camera.recorder.stopAndTakeClip()

    const pos = await getPosition()
    if (!pos) {
      setVoiceNote(t(lang, gatewayStrings.noLocation))
      return
    }
    const clip = await clipPromise
    const body = {
      source: 'text' as const,
      capturedAt: stampNow(),
      lat: pos.lat,
      lng: pos.lng,
      accuracyM: pos.accuracyM,
      chip: null,
      text,
      ...(state?.taskId ? { taskId: state.taskId } : {}),
    }
    try {
      if (outbox.submit) {
        await outbox.submit(body)
        await enqueueClipIfPresent(clip)
        // Outbox does not return the stored observation; leave receipt empty until the gateway/API provides it.
        talk.beginCoach()
      } else {
        const stored = await api.createObservation(body)
        talk.beginCoach({ receivedAt: stored.receivedAt, incidentLabel: null })
      }
      refresh()
    } catch {
      setVoiceNote(t(lang, gatewayStrings.noTranscript))
    }
  }

  /**
   * Wrap the chip/text outbox submit so the video clip is stopped and queued
   * together with the chip/text report.
   *
   * stopAndTakeClip() calls requestData() then stop() and waits for the
   * onstop blob, so the clip is ready even when the camera is still recording
   * at the moment Send is pressed (the most common case: the volunteer records
   * then taps Send without turning the camera off first).
   *
   * The clip is cleared from the recorder by stopAndTakeClip(), so pressing
   * Send a second time (e.g. after a network retry) does not double-submit it.
   */
  async function submitWithVideo(body: ObservationRequest): Promise<SubmitResult> {
    const clip = await camera.recorder.stopAndTakeClip()
    const result = await outbox.submit(body)
    await enqueueClipIfPresent(clip)
    return result
  }

  /**
   * Called synchronously just before the camera app or file picker opens.
   * Starts the clip finalisation immediately so onstop has time to fire while
   * the user is taking the photo. submitPhoto() awaits the result.
   */
  function onBeforePhotoCapture(): void {
    pendingClipRef.current = camera.recorder.stopAndTakeClip()
  }

  /**
   * Photo send path: submit the photo observation, then await any in-flight
   * clip and enqueue it as a separate video observation.
   */
  async function submitPhoto(body: PhotoObservationCreate): Promise<SubmitResult> {
    const result = await outbox.submit(body)
    if (pendingClipRef.current) {
      const clip = await pendingClipRef.current
      pendingClipRef.current = null
      await enqueueClipIfPresent(clip)
    }
    return result
  }

  return (
    <>
      <header className="report-page-header">
        <div className="report-heading-title">{onBack && <button type="button" className="back" onClick={onBack} aria-label={t(lang, screenStrings.common.back)}>←</button>}<div>{!taskContext && <p className="report-eyebrow">{t(lang, copy.fieldReport)}</p>}<h1>{t(lang, taskContext ? screenStrings.task.title : copy.reportFire)}</h1></div></div>
        <div className="report-live-tools" role="group" aria-label={t(lang, copy.liveOptions)}>
          <button type="button" className="report-tool" aria-expanded={videoOpen} aria-controls="report-live-panel" disabled={voiceActive} onClick={toggleVideo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="3" /><path d="m15 10 6-3v10l-6-3" /></svg>
            {t(lang, copy.video)}
          </button>
          <button type="button" className="report-tool" aria-expanded={callOpen || voiceActive} aria-controls="report-live-panel" title={t(lang, talk.view.status)} onClick={() => setCallOpen((open) => !open)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m8 3 3 5-3 3c1 2 3 4 5 5l3-3 5 3c0 3-2 5-5 5C9 21 3 15 3 8c0-3 2-5 5-5Z" /></svg>
            {t(lang, copy.call)}
          </button>
        </div>
      </header>
      {children}
      {(!taskContext || livePanelOpen) && <p className="report-page-intro">{t(lang, copy.quickReportIntro)}</p>}
      <section id="report-live-panel" className="report-live-panel" hidden={!livePanelOpen} aria-label={t(lang, videoOpen ? copy.videoAndVoice : copy.call)}>
        <div className="report-live-heading"><h2>{t(lang, videoOpen ? copy.videoAndVoice : copy.call)}</h2><button type="button" className="report-live-close" disabled={voiceActive} onClick={() => { camera.stop(); setVideoOpen(false); setCallOpen(false) }}>{t(lang, copy.closeLive)}</button></div>
      <div hidden={!videoOpen}>
      <CameraPanel
        lang={lang}
        state={camera.state}
        stream={camera.stream}
        onToggle={camera.toggle}
        accuracyM={position.kind === 'ok' ? position.accuracyM : null}
        onBack={onBack ?? (() => navigate('/pwa'))}
        // The browser cannot open the voice-gateway socket yet (contract section 7), so no frame leaves the phone.
        framesToCoach={false}
        recorderSnap={camera.recorderSnap}
      />
      </div>
      <CoachReply lang={lang} phase={talk.coach.phase} replyText={talk.coach.replyText} />
      <HoldToTalkPanel
        lang={lang}
        view={talk.view}
        transcript={talk.transcript}
        onPress={talk.onPress}
        onRelease={() => void onRelease()}
      />
      <CoachReceipt lang={lang} phase={talk.coach.phase} receivedAt={talk.coach.receivedAt} incidentLabel={talk.coach.incidentLabel} />
      {voiceNote && (
        <p className="muted small" role="status" data-testid="voice-note">
          {voiceNote}
        </p>
      )}
      </section>
      <div hidden={Boolean(taskContext) && !livePanelOpen} className="report-form-content">
      {!taskContext && state?.incidentId && (
        <p className="muted small" data-testid="report-context">
          {t(lang, screenStrings.report.forIncident)} {incidentLabelById(state.incidentId, digest?.incidents)}
        </p>
      )}
      {!taskContext && state?.taskId && (
        <p className="muted small" data-testid="report-task-context">
          {t(lang, screenStrings.report.forTask)} {digest?.myTasks.find((x) => x.id === state.taskId)?.instruction ?? ''}
        </p>
      )}
      <ReportPanel
        api={api}
        lang={lang}
        heading={t(lang, copy.whatDoYouSee)}
        photo={<div className="report-photo-option"><PhotoPanel compact api={api} upload={upload} lang={lang} getPosition={getPosition} submit={submitPhoto} queuePhoto={outbox.queuePhoto} taskId={state?.taskId} onBeforeCapture={onBeforePhotoCapture} /><p className="report-photo-hint">{t(lang, copy.photoSendsSeparately)}</p></div>}
        locate={locate}
        onLocationGranted={watchLocationGranted}
        preset={preset}
        taskId={state?.taskId}
        submit={submitWithVideo}
        volunteerId={volunteerId}
        onDone={() => taskContext ? (camera.stop(), setVideoOpen(false), setCallOpen(false)) : navigate('/pwa')}
      />
      </div>
      <OutboxPanel
        items={outbox.items}
        online={outbox.online}
        lang={lang}
        onRetry={(id) => void outbox.retry(id)}
        onDiscard={(id) => void outbox.discard(id)}
        onSendNow={() => void outbox.flush()}
      />
    </>
  )
}

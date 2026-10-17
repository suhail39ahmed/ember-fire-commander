import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { CoachReply } from '../gateway/CoachReply'
import { HoldToTalkPanel } from '../gateway/HoldToTalkPanel'
import { gatewayStrings } from '../gateway/gatewayStrings'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { OutboxPanel } from '../outbox/OutboxPanel'
import { PhotoPanel } from '../photo/PhotoPanel'
import { ReportPanel } from '../report/ReportPanel'
import { getPosition, locate, watchLocationGranted } from '../report/location'
import { stampNow } from '../clock'
import type { ChipValue } from '../contracts/types'
import { t } from '../i18n'
import { incidentLabelById } from '../incidentName'
import { screenStrings } from './strings'

/** The Report tab (#128 / #129 / #130): hold to talk, coach reply, chips, photo, outbox. */
export function ReportScreen() {
  const { lang } = useLanguage()
  const { api, volunteerId, outbox, upload, talk, digest, refresh } = useVolunteer()
  const navigate = useNavigate()
  const state = useLocation().state as { chip?: ChipValue | null; n?: number; incidentId?: string; taskId?: string } | null
  const preset = state && state.chip !== undefined ? { chip: state.chip, n: state.n ?? 1 } : undefined
  const [voiceNote, setVoiceNote] = useState<string | null>(null)

  async function onRelease() {
    const text = talk.takeTranscript()
    talk.onRelease()
    if (!text) {
      // No invented words when the gateway sent nothing (browser handshake is still undecided).
      return
    }
    setVoiceNote(null)
    const pos = await getPosition()
    if (!pos) {
      setVoiceNote(t(lang, gatewayStrings.noLocation))
      return
    }
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

  return (
    <>
      {state?.incidentId && (
        <p className="muted small" data-testid="report-context">
          {t(lang, screenStrings.report.forIncident)} {incidentLabelById(state.incidentId, digest?.incidents)}
        </p>
      )}
      {state?.taskId && (
        <p className="muted small" data-testid="report-task-context">
          {t(lang, screenStrings.report.forTask)} {digest?.myTasks.find((x) => x.id === state.taskId)?.instruction ?? ''}
        </p>
      )}
      <HoldToTalkPanel
        lang={lang}
        view={talk.view}
        transcript={talk.transcript}
        onPress={talk.onPress}
        onRelease={() => void onRelease()}
      />
      {voiceNote && (
        <p className="muted small" role="status" data-testid="voice-note">
          {voiceNote}
        </p>
      )}
      <CoachReply
        lang={lang}
        phase={talk.coach.phase}
        replyText={talk.coach.replyText}
        receivedAt={talk.coach.receivedAt}
        incidentLabel={talk.coach.incidentLabel}
      />
      <ReportPanel
        api={api}
        lang={lang}
        locate={locate}
        onLocationGranted={watchLocationGranted}
        preset={preset}
        taskId={state?.taskId}
        submit={outbox.submit}
        volunteerId={volunteerId}
        onDone={() => navigate('/pwa')}
      />
      <PhotoPanel api={api} upload={upload} lang={lang} getPosition={getPosition} submit={outbox.submit} queuePhoto={outbox.queuePhoto} taskId={state?.taskId} />
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

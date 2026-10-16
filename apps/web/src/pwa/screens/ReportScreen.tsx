import { useLocation, useNavigate } from 'react-router-dom'

import { TalkCard } from '../gateway/TalkCard'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { OutboxPanel } from '../outbox/OutboxPanel'
import { PhotoPanel } from '../photo/PhotoPanel'
import { ReportPanel } from '../report/ReportPanel'
import { getPosition, locate, watchLocationGranted } from '../report/location'
import type { ChipValue } from '../contracts/types'
import { t } from '../i18n'
import { incidentLabelById } from '../incidentName'
import { screenStrings } from './strings'

/** The Report tab (#128): hold to talk, the chip and note form, a photo, and what is waiting to send. */
export function ReportScreen() {
  const { lang } = useLanguage()
  const { api, volunteerId, outbox, upload, talk, digest, refresh } = useVolunteer()
  const navigate = useNavigate()
  const state = useLocation().state as { chip?: ChipValue | null; n?: number; incidentId?: string; taskId?: string } | null
  const preset = state && state.chip !== undefined ? { chip: state.chip, n: state.n ?? 1 } : undefined

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
      <TalkCard lang={lang} view={talk.view} onPress={talk.onPress} onRelease={talk.onRelease} />
      <ReportPanel
        api={api}
        lang={lang}
        locate={locate}
        onLocationGranted={watchLocationGranted}
        preset={preset}
        submit={outbox.submit}
        volunteerId={volunteerId}
        watch={{ digest, refresh }}
        onDone={() => navigate('/pwa')}
      />
      <PhotoPanel api={api} upload={upload} lang={lang} getPosition={getPosition} submit={outbox.submit} queuePhoto={outbox.queuePhoto} />
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

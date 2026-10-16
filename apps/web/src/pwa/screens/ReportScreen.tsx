import { useLocation } from 'react-router-dom'

import { TalkCard } from '../gateway/TalkCard'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import { OutboxPanel } from '../outbox/OutboxPanel'
import { PhotoPanel } from '../photo/PhotoPanel'
import { ReportPanel } from '../report/ReportPanel'
import { getPosition, locate, watchLocationGranted } from '../report/location'
import type { ChipValue } from '../contracts/types'

/** The Report tab (#128): hold to talk, the chip and note form, a photo, and what is waiting to send. */
export function ReportScreen() {
  const { lang } = useLanguage()
  const { api, volunteerId, outbox, upload, talk } = useVolunteer()
  const state = useLocation().state as { chip?: ChipValue | null; n?: number } | null
  const preset = state && state.chip !== undefined ? { chip: state.chip, n: state.n ?? 1 } : undefined

  return (
    <>
      <TalkCard lang={lang} view={talk.view} onPress={talk.onPress} onRelease={talk.onRelease} />
      <ReportPanel
        api={api}
        lang={lang}
        locate={locate}
        onLocationGranted={watchLocationGranted}
        preset={preset}
        submit={outbox.submit}
        volunteerId={volunteerId}
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

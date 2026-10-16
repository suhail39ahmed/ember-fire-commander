import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { currentTask } from '../digest'
import { t, type Lang } from '../i18n'
import { useLanguage } from '../language'
import { useVolunteer } from '../layout/volunteerContext'
import type { DevicePosition } from './arrival'
import { buildSms, incidentCodeOf, smsHref, type SmsKind } from './sms'
import { screenStrings } from './strings'
import { useDevicePosition } from './useDevicePosition'
import { useNow } from '../useDeviceStatus'
import { liveIncidents } from './incidentsView'

const s = screenStrings.sms
const KINDS: SmsKind[] = ['help', 'safe', 'spreading']

/** SMS fallback (#151): the message is built from what the phone knows, then the phone's own SMS app sends it. */
export function SmsView({
  lang,
  kind,
  onKind,
  body,
  position,
  onBack,
}: {
  lang: Lang
  kind: SmsKind
  onKind: (kind: SmsKind) => void
  body: string
  position: DevicePosition
  onBack: () => void
}) {
  return (
    <>
      <div className="screen-head">
        <button type="button" className="back" onClick={onBack} aria-label={t(lang, screenStrings.common.back)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <h2>{t(lang, s.title)}</h2>
      </div>
      <p className="muted">{t(lang, s.lead)}</p>
      <section aria-label={t(lang, s.to)}>
        <p className="section-label">{t(lang, s.to)}</p>
        <p className="card" data-testid="sms-recipients">{t(lang, s.noRecipients)}</p>
      </section>
      <section aria-label={t(lang, s.message)}>
        <p className="section-label">{t(lang, s.message)}</p>
        <p className="card mono sms-body" data-testid="sms-body">{body}</p>
      </section>
      <div className="chips" role="radiogroup" aria-label={t(lang, s.kinds)}>
        {KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={`chip${kind === k ? ' selected' : ''}`} onClick={() => onKind(k)} data-testid={`sms-kind-${k}`}>
            {t(lang, s[k])}
          </button>
        ))}
      </div>
      {position.kind !== 'ok' && <p className="warn small" data-testid="sms-no-location">{t(lang, s.noLocation)}</p>}
      <a className="btn ink report-cta" href={smsHref(body)} data-testid="sms-open">
        {t(lang, s.open)}
      </a>
      <p className="warn small">{t(lang, s.replies)}</p>
    </>
  )
}

export function SmsScreen() {
  const { lang } = useLanguage()
  const { me, digest } = useVolunteer()
  const navigate = useNavigate()
  const [kind, setKind] = useState<SmsKind>('help')
  const position = useDevicePosition(true)
  const now = useNow(15_000)
  // The incident the volunteer is working on, else the first live one, from the last digest.
  const task = currentTask(digest)
  const incident = digest?.incidents.find((i) => i.id === task?.incidentId) ?? liveIncidents(digest)[0]
  const body = buildSms({ kind, name: me?.displayName ?? null, incidentCode: incidentCodeOf(incident?.name), at: new Date(now), position })
  return <SmsView lang={lang} kind={kind} onKind={setKind} body={body} position={position} onBack={() => navigate(-1)} />
}


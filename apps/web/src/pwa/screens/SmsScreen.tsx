import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SmsRecipient } from '../../auth/api'

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
import './field.css'

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
  recipients = [],
  selectedRecipients = [],
  onRecipient,
}: {
  lang: Lang
  kind: SmsKind
  onKind: (kind: SmsKind) => void
  body: string
  position: DevicePosition
  onBack: () => void
  recipients?: SmsRecipient[]
  selectedRecipients?: string[]
  onRecipient?: (id: string) => void
}) {
  const selected = recipients.filter((recipient) => selectedRecipients.includes(recipient.id))
  const needsRecipient = recipients.length > 0 && selected.length === 0
  return (
    <section className="sms-screen" aria-labelledby="sms-title">
      <button type="button" className="sms-back" onClick={onBack}>← {t(lang, screenStrings.common.back)}</button>
      <h2 id="sms-title">{t(lang, s.title)}</h2>
      <p className="sms-lead">{t(lang, s.lead)}</p>
      <section className="sms-section" aria-label={t(lang, s.to)}>
        <p className="section-label">{t(lang, s.to)}</p>
        <div className="sms-recipients" data-testid="sms-recipients">
          {recipients.length ? recipients.map((recipient) => <label key={recipient.id} className="sms-recipient">
            <input type="checkbox" checked={selectedRecipients.includes(recipient.id)} onChange={() => onRecipient?.(recipient.id)} />
            <span><strong>{recipient.name} · {t(lang, recipient.role === 'crew_lead' ? s.crewLead : s.dutyLine)}</strong><small>{recipient.phone.slice(0, 5)} •••• {recipient.phone.slice(-4)}</small></span>
          </label>) : <p className="muted small">{t(lang, s.noRecipients)}</p>}
        </div>
      </section>
      <section className="sms-section" aria-label={t(lang, s.message)}>
        <p className="section-label">{t(lang, s.message)}</p>
        <p className="sms-body" data-testid="sms-body">{body}</p>
      </section>
      <div className="sms-kinds" role="radiogroup" aria-label={t(lang, s.kinds)}>
        {KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className="sms-kind" onClick={() => onKind(k)} data-testid={`sms-kind-${k}`}>
            {t(lang, s[k])}
          </button>
        ))}
      </div>
      {position.kind !== 'ok' && <p className="warn small" data-testid="sms-no-location">{t(lang, s.noLocation)}</p>}
      {needsRecipient && <p className="warn" role="status">{t(lang, s.chooseRecipient)}</p>}
      <a className="sms-open" href={needsRecipient ? undefined : smsHref(body, selected.map((recipient) => recipient.phone))} aria-disabled={needsRecipient || undefined} data-testid="sms-open">
        {t(lang, s.open)}
      </a>
      <p className="warn small">{t(lang, s.replies)}</p>
      <p className="muted small">{t(lang, s.cellular)}</p>
    </section>
  )
}

export function SmsScreen() {
  const { lang } = useLanguage()
  const { me, digest, perms, position: knownPosition } = useVolunteer()
  const navigate = useNavigate()
  const [kind, setKind] = useState<SmsKind>('help')
  const recipients = me?.sms?.recipients ?? []
  const [excluded, setExcluded] = useState<string[]>([])
  const selectedRecipients = recipients.filter((recipient) => !excluded.includes(recipient.id)).map((recipient) => recipient.id)
  const gps = useDevicePosition(perms.location === 'granted')
  const position = gps.kind === 'ok' ? gps : knownPosition.kind === 'ok' ? knownPosition : gps
  const now = useNow(15_000)
  // The incident the volunteer is working on, else the first live one, from the last digest.
  const task = currentTask(digest)
  const incident = digest?.incidents.find((i) => i.id === task?.incidentId) ?? liveIncidents(digest)[0]
  const body = buildSms({ kind, name: me?.displayName ?? null, incidentCode: incidentCodeOf(incident?.name), at: new Date(now), position, template: me?.sms?.templates[kind] })
  return <SmsView lang={lang} kind={kind} onKind={setKind} body={body} position={position} recipients={recipients} selectedRecipients={selectedRecipients} onRecipient={(id) => setExcluded((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id])} onBack={() => navigate('/pwa')} />
}


import { useEffect, useState } from 'react'

import { formatTimeZone } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import type { IncidentDecision } from '../contracts'
import { submitSafe } from './markSafe'
import { cardCopy } from './cardCopy'
import { deliveryFacts, placeLine } from './cardModel'
import { elapsedSince, telHref, unconfirmed, type WithdrawState } from './withdrawState'
import { countText, stateCopy } from './withdrawStateCopy'
import './withdrawPanel.css'

export interface WithdrawPanelProps {
  lang: Lang
  state: WithdrawState
  /** The server clock in ms. */
  now: () => number
  offline: boolean
  markSafe: (volunteerId: string) => Promise<IncidentDecision>
  /** The reporter's name as the API gave it, else a short code. */
  nameOf: (volunteerId: string) => string
}

function Header({ lang, state }: { lang: Lang; state: WithdrawState }) {
  const by = state.source === 'code' ? t(lang, stateCopy.sentByCode) : state.source === 'supervisor' ? t(lang, stateCopy.sentBySupervisor) : null
  const at = state.sentAt ? formatTimeZone(state.sentAt) : null
  return (
    <div className="wd-head">
      <p className="wd-eyebrow">
        <span className="wd-dot" aria-hidden="true" />
        {t(lang, stateCopy.inForce)}
        {by && ` · ${by}`}
        {by && at && ` ${at}`}
      </p>
      <p className="wd-rule">{t(lang, stateCopy.rule)}</p>
    </div>
  )
}

function Progress({ lang, state }: { lang: Lang; state: WithdrawState }) {
  return (
    <>
      <div className="wd-bar" role="img" aria-label={`${t(lang, stateCopy.progress)}: ${countText(lang, state)}`}>
        {state.people.map((p) => <span key={p.id} className={p.safe ? 'wd-seg safe' : 'wd-seg'} />)}
      </div>
      <p className="wd-count">{countText(lang, state)} {t(lang, stateCopy.confirmedOf)}</p>
    </>
  )
}

/**
 * The WITHDRAW banner. While someone is unconfirmed it is the "not confirmed" state: it shows who sent
 * the withdraw and when, why, how many are safe, and for each unconfirmed volunteer a call link and
 * "Mark found safe". When everyone is marked safe it is the plain banner. There is no control that
 * cancels the withdraw, and nothing here asks for an approval.
 */
export function WithdrawPanel({ lang, state, now, offline, markSafe, nameOf }: WithdrawPanelProps) {
  const [tick, setTick] = useState(() => now())
  const [asking, setAsking] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const open = unconfirmed(state)

  useEffect(() => {
    if (state.allSafe || !state.sentAt) return
    const timer = window.setInterval(() => setTick(now()), 1000)
    return () => window.clearInterval(timer)
  }, [state.allSafe, state.sentAt, now])

  async function confirm(id: string) {
    setBusy(id)
    setResult(null)
    const outcome = await submitSafe(markSafe, id, nameOf(id), lang)
    setBusy(null)
    setAsking(null)
    setResult({ ok: outcome.ok, text: outcome.text })
  }

  const elapsed = elapsedSince(state.sentAt, tick)
  return (
    <section className={state.allSafe ? 'wd wd-safe' : 'wd wd-open'} role="alert" aria-live="assertive" aria-label={t(lang, stateCopy.inForce)}>
      <Header lang={lang} state={state} />
      <p className="wd-text">{state.instruction}</p>
      <p className="wd-reason">
        {state.reasons.length > 0 ? <><b>{t(lang, stateCopy.reasonLabel)}:</b> {state.reasons.join(' · ')}</> : t(lang, stateCopy.noReason)}
      </p>
      <Progress lang={lang} state={state} />

      {state.allSafe ? (
        <p className="wd-note">{t(lang, stateCopy.allSafe)}</p>
      ) : (
        <ul className="wd-people">
          {open.map((person) => {
            const name = nameOf(person.id)
            const href = person.phone ? telHref(person.phone) : null
            const asked = asking === person.id
            const heard = deliveryFacts(lang, person.card)
            const place = placeLine(person.card)
            const lastAt = person.card?.lastReportAt
            return (
              <li key={person.id} className="wd-person">
                <p className="wd-who">
                  {name} · {t(lang, stateCopy.notConfirmed)}{elapsed && ` · ${elapsed}`}
                </p>
                {(lastAt || place || heard.length > 0) && (
                  <p className="wd-facts">
                    {[lastAt ? `${t(lang, cardCopy.lastReport)} ${formatTimeZone(lastAt)}` : null, place, ...heard].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="wd-actions">
                  {href ? (
                    <a className="wd-btn wd-call" href={href}>{t(lang, stateCopy.call)} {name}</a>
                  ) : (
                    <button type="button" className="wd-btn" disabled title={t(lang, stateCopy.noPhone)}>
                      {t(lang, stateCopy.call)} {name} · {t(lang, stateCopy.noPhone)}
                    </button>
                  )}
                  {asked ? (
                    <>
                      <button type="button" className="wd-btn wd-yes" disabled={offline || busy !== null} onClick={() => void confirm(person.id)}>
                        {busy === person.id ? t(lang, stateCopy.saving) : `${t(lang, stateCopy.confirmYes)} · ${name}`}
                      </button>
                      <button type="button" className="wd-btn" disabled={busy !== null} onClick={() => setAsking(null)}>{t(lang, stateCopy.confirmNo)}</button>
                    </>
                  ) : (
                    <button type="button" className="wd-btn" disabled={offline || busy !== null} onClick={() => { setResult(null); setAsking(person.id) }}>
                      {t(lang, stateCopy.markSafe)}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {result && <p className={result.ok ? 'wd-result' : 'wd-result wd-error'} role={result.ok ? 'status' : 'alert'}>{result.text}</p>}
    </section>
  )
}

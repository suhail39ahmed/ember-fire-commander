import { useEffect, useState } from 'react'

import { formatTimeZone } from '../../pwa/formatTime'
import { t, type Lang } from '../../pwa/i18n'
import type { IncidentDecision } from '../contracts'
import { Modal } from './Modal'
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
  clearWithdraw?: (reason: string) => Promise<IncidentDecision>
  requestHelp?: (volunteerId: string, helperId: string, instruction: string) => Promise<unknown>
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
 * clears the order until every recipient is safe. No approval step is required.
 */
export function WithdrawPanel({ lang, state, now, offline, markSafe, nameOf, clearWithdraw, requestHelp }: WithdrawPanelProps) {
  const [tick, setTick] = useState(() => now())
  const [asking, setAsking] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const open = state.people
  const [clearing, setClearing] = useState(false)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [helpFor, setHelpFor] = useState<string | null>(null)
  const [helperId, setHelperId] = useState('')
  const text = (en: string, id: string) => lang === 'en' ? en : id
  async function clear() {
    if (!clearWithdraw || !state.allSafe || !reason || (reason === 'Other' && !note.trim()) || busy) return
    setBusy('clear')
    try { await clearWithdraw(reason === 'Other' ? note.trim() : reason); setClearing(false) }
    catch (error) { setResult({ ok: false, text: error instanceof Error ? error.message : text('Could not clear. Try again.', 'Gagal mencabut. Coba lagi.') }) }
    finally { setBusy(null) }
  }
  async function help() {
    if (!requestHelp || !helpFor || !helperId || busy) return
    setBusy('help')
    try {
      await requestHelp(helpFor, helperId, `${text('Please contact', 'Tolong hubungi')} ${nameOf(helpFor)}. ${text('Contact your supervisor before approaching. Stay upwind; do not re-enter danger.', 'Hubungi supervisor sebelum mendekat. Tetap di atas angin; jangan masuk kembali ke bahaya.')}`)
      setResult({ ok: true, text: `${nameOf(helperId)} ${text('has been asked to help.', 'telah diminta membantu.')}` }); setHelpFor(null)
    } catch (error) { setResult({ ok: false, text: error instanceof Error ? error.message : 'Could not send' }) }
    finally { setBusy(null) }
  }

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

      <button type="button" className="wd-btn wd-clear" disabled={!state.allSafe || offline || busy !== null || !clearWithdraw} onClick={() => { setResult(null); setClearing(true) }}>
        {text('Clear withdraw', 'Cabut withdraw')}
      </button>
      {state.allSafe && <p className="wd-note">{t(lang, stateCopy.allSafe)}</p>}
      <ul className="wd-people">
          {open.map((person) => {
            const name = nameOf(person.id)
            const href = person.phone ? telHref(person.phone) : null
            const asked = asking === person.id
            const heard = deliveryFacts(lang, person.card)
            const place = placeLine(person.card)
            const lastAt = person.card?.lastReportAt
            const locationAt = person.card?.locationAt
            return (
              <li key={person.id} className="wd-person">
                <p className="wd-who">
                  {name} · {person.safe ? text(person.markedSafe ? 'Marked found safe' : 'Confirmed safe upwind', 'Dikonfirmasi aman') : person.answer === 'stuck' ? text("I can’t get out", 'Tidak bisa keluar') : t(lang, stateCopy.notConfirmed)}{!person.safe && elapsed && ` · ${elapsed}`}
                </p>
                {(lastAt || place || heard.length > 0) ? (
                  <p className="wd-facts">
                    {[locationAt ? `${text('Location updated', 'Lokasi diperbarui')} ${formatTimeZone(locationAt)}` : null, lastAt ? `${t(lang, cardCopy.lastReport)} ${formatTimeZone(lastAt)}` : null, place, ...heard].filter(Boolean).join(' · ')}
                  </p>
                ) : (
                  <p className="wd-facts wd-facts-none">{t(lang, stateCopy.noLastContact)}</p>
                )}
                <div className="wd-actions">
                  {href ? (
                    <a className="wd-btn wd-call" href={href}>{t(lang, stateCopy.call)} {name}</a>
                  ) : (
                    <button type="button" className="wd-btn" disabled title={t(lang, stateCopy.noPhone)}>
                      {t(lang, stateCopy.call)} {name} · {t(lang, stateCopy.noPhone)}
                    </button>
                  )}
                  {!person.safe && requestHelp && <button type="button" className="wd-btn" disabled={offline || busy !== null || !state.people.some((p) => p.id !== person.id && p.safe)} onClick={() => { setHelperId(''); setHelpFor(person.id) }}>{text('Ask someone to help', 'Minta bantuan relawan')}</button>}
                  {!person.markedSafe && (asked ? (
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
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      {clearing && <Modal title={text('Clear the WITHDRAW?', 'Cabut WITHDRAW?')} onClose={() => setClearing(false)} dismissible={busy === null}>
        <p>{text('Every phone switches to “Withdraw cleared — stand by”. Nobody goes back in until you send a new task.', 'Semua ponsel menampilkan withdraw dicabut. Tunggu tugas baru sebelum kembali.')}</p>
        <fieldset className="wd-reasons"><legend>{text('WHY ARE YOU CLEARING IT? (REQUIRED)', 'ALASAN PENCABUTAN (WAJIB)')}</legend>
          {['Wind steady, smoke cleared', 'Fire died down', 'Crew moved to a safe spot', 'Agency took over', 'Other'].map((value, index) => <label key={value}><input type="radio" name="clear-reason" checked={reason === value} onChange={() => setReason(value)} />{lang === 'en' ? value : ['Angin stabil, asap hilang', 'Api mereda', 'Tim pindah ke tempat aman', 'Instansi mengambil alih', 'Lainnya'][index]}</label>)}
        </fieldset>
        {reason === 'Other' && <label>{text('Add a note', 'Tambahkan catatan')}<textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>}
        <p>{text('BEFORE YOU CLEAR', 'SEBELUM MENCABUT')}: {state.confirmed} / {state.total} {text('safe. Your name, reason and time will be logged.', 'aman. Nama, alasan, dan waktu akan dicatat.')}</p>
        {unconfirmed(state).length > 0 && <p role="alert">{unconfirmed(state).map((p) => nameOf(p.id)).join(', ')}</p>}
        <div className="inc-modal-actions"><button className="wd-btn" disabled={busy !== null} onClick={() => setClearing(false)}>{text('Cancel', 'Batal')}</button><button className="wd-btn wd-call" disabled={!state.allSafe || !reason || (reason === 'Other' && !note.trim()) || busy !== null || offline} onClick={() => void clear()}>{busy ? text('Clearing…', 'Mencabut…') : text('Clear withdraw', 'Cabut withdraw')}</button></div>
        {result && !result.ok && <p role="alert">{result.text}</p>}
      </Modal>}
      {helpFor && <Modal title={`${text('Ask someone to help', 'Minta bantuan untuk')} ${nameOf(helpFor)}`} onClose={() => setHelpFor(null)} dismissible={busy === null}>
        <label>{text('Volunteer already safe', 'Relawan yang sudah aman')}<select value={helperId} onChange={(e) => setHelperId(e.target.value)}><option value="">{text('Choose a volunteer', 'Pilih relawan')}</option>{state.people.filter((p) => p.id !== helpFor && p.safe).map((p) => <option key={p.id} value={p.id}>{nameOf(p.id)}</option>)}</select></label>
        <p>{text('They will receive an instruction to contact you before approaching. Do not send anyone back into danger.', 'Mereka menerima instruksi untuk menghubungi Anda sebelum mendekat. Jangan mengirim siapa pun ke bahaya.')}</p>
        <button className="wd-btn" disabled={!helperId || busy !== null || offline} onClick={() => void help()}>{text('Send request', 'Kirim permintaan')}</button>
        {result && !result.ok && <p role="alert">{result.text}</p>}
      </Modal>}
      {result && <p className={result.ok ? 'wd-result' : 'wd-result wd-error'} role={result.ok ? 'status' : 'alert'}>{result.text}</p>}
    </section>
  )
}

import type { Withdraw } from '../contracts/types'
import { TalkCard } from '../gateway/TalkCard'
import type { TalkView } from '../gateway/voiceView'
import { formatTime } from '../formatTime'
import { t, type Lang } from '../i18n'
import type { ActionState } from './actionState'
import { screenStrings } from './strings'
import type { DevicePosition } from './arrival'

const s = screenStrings.withdraw

type Talk = { view: TalkView; onPress: () => void; onRelease: () => void }

function Shield() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 5 6v6c0 4.5 3 7.6 7 9 4-1.4 7-4.5 7-9V6z" />
    </svg>
  )
}

function Failed({ action, lang }: { action: ActionState; lang: Lang }) {
  return action.kind === 'failed' ? (
    <p className="withdraw-error" role="alert" data-testid="withdraw-failed">
      {t(lang, s.sendFailed)}
    </p>
  ) : null
}

/** WITHDRAW, step 1 (#146): the order, why it was sent, and a way to talk. It cannot be closed. */
export function WithdrawCover({
  lang,
  instruction,
  sentAt,
  source,
  reasons,
  others,
  note,
  talk,
  weather,
}: {
  lang: Lang
  instruction: string | null
  sentAt: string | null
  source: 'code' | 'supervisor' | null
  reasons: string[]
  others: number
  /** Said once the volunteer, or a supervisor, has marked them safe. */
  note: string | null
  weather?: Withdraw['weather']
  talk: Talk
}) {
  const head = [t(lang, s.safetyRule), sentAt ? formatTime(sentAt) : null, source ? `${t(lang, s.sentBy)} ${t(lang, source === 'code' ? s.code : s.supervisor)}` : null].filter(Boolean).join(' · ')
  return (
    <div className="withdraw" role="alertdialog" aria-modal="true" aria-labelledby="withdraw-title" aria-describedby="withdraw-instruction" data-testid="withdraw-cover">
      <Shield />
      <p className="withdraw-label" data-testid="withdraw-head">{head}</p>
      <h1 id="withdraw-title" className="withdraw-order-title">{lang === 'en' ? <>Withdraw<br />upwind.</> : <>Mundur<br />ke atas angin.</>}</h1>
      <h2 className="withdraw-command">{lang === 'en' ? 'Do not engage.' : 'Jangan mendekat.'}</h2>
      {instruction && <p id="withdraw-instruction" className="withdraw-instruction">{instruction}</p>}
      {weather?.windFrom && <section className="withdraw-card withdraw-wind"><strong>{lang === 'en' ? 'Upwind is' : 'Arah atas angin'} {weather.windFrom}</strong><span>{weather.windKmh !== null && `${weather.windKmh} km/h · `}{weather.source}{weather.observedAt && ` · ${formatTime(weather.observedAt)}`}</span></section>}
      {note && <p className="withdraw-note" role="status" data-testid="withdraw-note">{note}</p>}
      <section className="withdraw-card" aria-label={t(lang, s.why)}>
        <p className="withdraw-label">{t(lang, s.why)}</p>
        <ul>
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
          <li data-testid="withdraw-others">
            {others > 0 ? `${t(lang, s.sentToOthers)} ${others} ${t(lang, others === 1 ? s.otherVolunteer : s.otherVolunteers)}.` : t(lang, s.sentToYou)}
          </li>
        </ul>
      </section>
      <div className="withdraw-actions"><TalkCard lang={lang} view={talk.view} onPress={talk.onPress} onRelease={talk.onRelease} />
      <p className="withdraw-why">{t(lang, s.stays)}</p>
      </div>
    </div>
  )
}

/** WITHDRAW, step 2 (#147): "Are you somewhere safe?" with the two answers. */
export function ConfirmSafe({
  lang,
  instruction,
  sentAt,
  action,
  onSafe,
  onStuck,
  weather,
}: {
  lang: Lang
  instruction: string | null
  sentAt: string | null
  action: ActionState
  onSafe: () => void
  onStuck: () => void
  weather?: Withdraw['weather']
}) {
  const busy = action.kind === 'busy'
  const head = ['WITHDRAW', sentAt ? formatTime(sentAt) : null, t(lang, s.stillInForce)].filter(Boolean).join(' · ')
  return (
    <div className="withdraw soft" role="alertdialog" aria-modal="true" aria-labelledby="withdraw-title" data-testid="withdraw-confirm">
      <Shield />
      <p className="withdraw-label">{head}</p>
      <h1 id="withdraw-title">{t(lang, s.confirmTitle)}</h1>
      {weather?.windFrom && <p>{lang === 'en' ? 'Upwind is' : 'Arah atas angin'} {weather.windFrom}{weather.observedAt && ` · ${formatTime(weather.observedAt)}`}</p>}
      {instruction && <p className="withdraw-instruction">{instruction}</p>}
      <p className="withdraw-card" role="status">{t(lang, s.repeats)}</p>
      <div className="withdraw-actions">
        <button type="button" className="btn answer safe" onClick={onSafe} disabled={busy} data-testid="withdraw-safe">
          <strong>{busy ? t(lang, s.sending) : t(lang, s.imSafe)}</strong>
          <span>{t(lang, s.imSafeSub)}</span>
        </button>
        <button type="button" className="btn answer stuck" onClick={onStuck} disabled={busy} data-testid="withdraw-stuck">
          <strong>{t(lang, s.cantGetOut)}</strong>
          <span>{t(lang, s.cantGetOutSub)}</span>
        </button>
        <Failed action={action} lang={lang} />
      </div>
    </div>
  )
}

/** "I can't get out" (#148): help was asked for, the phone keeps sharing its position. */
export function HelpSent({
  lang,
  answeredAt,
  position,
  batteryPct,
  action,
  talk,
  onOut,
}: {
  lang: Lang
  answeredAt: string | null
  position: DevicePosition
  batteryPct: number | null
  action: ActionState
  talk: Talk
  onOut: () => void
}) {
  const located = position.kind === 'ok'
  const facts = [located ? `±${position.accuracyM} m` : null, batteryPct !== null ? `${t(lang, s.battery)} ${batteryPct} %` : null].filter(Boolean)
  return (
    <div className="withdraw soft" role="alertdialog" aria-modal="true" aria-labelledby="withdraw-title" data-testid="withdraw-help">
      <p className="withdraw-label">{[t(lang, s.helpSent), answeredAt ? formatTime(answeredAt) : null].filter(Boolean).join(' · ')}</p>
      <h1 id="withdraw-title">{located ? t(lang, s.helpTitle) : t(lang, s.helpNoLocation)}</h1>
      {located && (
        <section className="withdraw-card" data-testid="withdraw-sharing">
          <strong>{t(lang, s.sharing)}</strong>
          {facts.length > 0 && <span className="muted small">{facts.join(' · ')}</span>}
        </section>
      )}
      <section className="withdraw-card" aria-label={t(lang, s.whileYouWait)}>
        <p className="withdraw-label">{t(lang, s.whileYouWait)}</p>
        <ul>
          {s.tips.map((tip) => (
            <li key={tip.en}>{t(lang, tip)}</li>
          ))}
        </ul>
      </section>
      <div className="withdraw-actions">
        <TalkCard lang={lang} view={talk.view} onPress={talk.onPress} onRelease={talk.onRelease} />
        <button type="button" className="btn answer safe" onClick={onOut} disabled={action.kind === 'busy'} data-testid="withdraw-out">
          <strong>{t(lang, s.imOut)}</strong>
        </button>
        <Failed action={action} lang={lang} />
      </div>
    </div>
  )
}

/** Withdraw lifted (#149): shown once, when the order is no longer in the digest. */
export function WithdrawCleared({
  lang,
  sentAt,
  reasons,
  clearedAtMs,
  clearedByName,
  clearReason,
  onDismiss,
}: {
  lang: Lang
  sentAt: string | null
  reasons: string[]
  clearedAtMs: number
  clearedByName?: string
  clearReason?: string
  onDismiss: () => void
}) {
  return (
    <section className="cleared" data-testid="withdraw-cleared">
      <div className="cleared-card">
        <p className="section-label">✓ {t(lang, s.clearedLabel)} · {formatTime(clearedAtMs)}{clearedByName && ` · ${clearedByName}`}</p>
        <h2>{t(lang, s.clearedTitle)}</h2>
        <p>{t(lang, s.clearedBody)}</p>
      </div>
      <div className="card" aria-label={t(lang, s.happened)}>
        <p className="section-label">{t(lang, s.happened)}</p>
        <ul className="timeline">
          {sentAt && (
            <li>
              {formatTime(sentAt)} {t(lang, s.sentLine)}
            </li>
          )}
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
          <li>
            {formatTime(clearedAtMs)} {clearReason ?? t(lang, s.seenGone)}
          </li>
        </ul>
      </div>
      <button type="button" className="btn secondary" onClick={onDismiss} data-testid="withdraw-cleared-ok">
        {t(lang, s.standingBy)}
      </button>
    </section>
  )
}

/** A safety confirmation stops the alarm, but only the supervisor ends the order. */
export function SafeWaiting({ lang, supervisorSafe, answeredAt, confirmed, total, talk, helpInstruction }: {
  lang: Lang; supervisorSafe: boolean; answeredAt: string | null; confirmed: number; total: number; talk: Talk; helpInstruction?: string | null
}) {
  const en = lang === 'en'
  return <div className="withdraw withdraw-waiting" role="alertdialog" aria-modal="true" aria-labelledby="withdraw-title" tabIndex={-1}>
    <Shield />
    <p className="withdraw-label">WITHDRAW · {en ? 'STILL IN FORCE' : 'MASIH BERLAKU'} · {supervisorSafe ? (en ? 'MARKED SAFE' : 'DITANDAI AMAN') : (en ? "YOU’RE SAFE" : 'ANDA AMAN')}{answeredAt && ` ${formatTime(answeredAt)}`}</p>
    <h1 id="withdraw-title">{en ? 'Stay upwind.' : 'Tetap di atas angin.'}</h1><h2 className="withdraw-command">{en ? 'Don’t go back in.' : 'Jangan kembali.'}</h2>
    <p className="withdraw-translation">TETAP DI ATAS ANGIN. JANGAN KEMBALI.</p>
    <section className="withdraw-card"><strong>{en ? "You’re marked safe" : 'Anda ditandai aman'}</strong><p>{supervisorSafe ? t(lang, s.notedBySupervisor) : t(lang, s.noted)}</p></section>
    <section className="withdraw-card"><p className="withdraw-label">{en ? 'WAITING FOR YOUR SUPERVISOR' : 'MENUNGGU SUPERVISOR'}</p><ul><li>{confirmed} / {total} {en ? 'safe' : 'aman'}</li><li>{en ? 'Only your supervisor can end it' : 'Hanya supervisor yang dapat mencabutnya'}</li></ul></section>
    {helpInstruction && <section className="withdraw-card" role="status"><strong>{en ? 'Your supervisor asks' : 'Permintaan supervisor'}</strong><p>{helpInstruction}</p></section>}
    <div className="withdraw-actions"><TalkCard lang={lang} view={talk.view} onPress={talk.onPress} onRelease={talk.onRelease} /><p>{en ? 'Your alarm is off. This screen stays until your supervisor clears the withdraw.' : 'Alarm berhenti. Layar ini tetap tampil sampai supervisor mencabut withdraw.'}</p></div>
  </div>
}

import { TalkCard } from '../gateway/TalkCard'
import type { TalkView } from '../gateway/voiceView'
import { formatTime } from '../formatTime'
import { strings, t, type Lang } from '../i18n'
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
}: {
  lang: Lang
  instruction: string | null
  sentAt: string | null
  source: 'code' | 'supervisor' | null
  reasons: string[]
  others: number
  /** Said once the volunteer, or a supervisor, has marked them safe. */
  note: string | null
  talk: Talk
}) {
  const head = [t(lang, s.safetyRule), sentAt ? formatTime(sentAt) : null, source ? `${t(lang, s.sentBy)} ${t(lang, source === 'code' ? s.code : s.supervisor)}` : null].filter(Boolean).join(' · ')
  return (
    <div className="withdraw" role="alertdialog" aria-modal="true" aria-labelledby="withdraw-title" aria-describedby="withdraw-instruction" data-testid="withdraw-cover">
      <Shield />
      <p className="withdraw-label" data-testid="withdraw-head">{head}</p>
      <h1 id="withdraw-title">{t(lang, strings.withdrawTitle)}</h1>
      {instruction && <p id="withdraw-instruction" className="withdraw-instruction">{instruction}</p>}
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
      <TalkCard lang={lang} view={talk.view} onPress={talk.onPress} onRelease={talk.onRelease} />
      <p className="withdraw-why">{t(lang, s.stays)}</p>
      <p className="badge-simulated on-dark">{t(lang, strings.simulated)}</p>
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
}: {
  lang: Lang
  instruction: string | null
  sentAt: string | null
  action: ActionState
  onSafe: () => void
  onStuck: () => void
}) {
  const busy = action.kind === 'busy'
  const head = ['WITHDRAW', sentAt ? formatTime(sentAt) : null, t(lang, s.stillInForce)].filter(Boolean).join(' · ')
  return (
    <div className="withdraw soft" role="alertdialog" aria-modal="true" aria-labelledby="withdraw-title" data-testid="withdraw-confirm">
      <Shield />
      <p className="withdraw-label">{head}</p>
      <h1 id="withdraw-title">{t(lang, s.confirmTitle)}</h1>
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
  onDismiss,
}: {
  lang: Lang
  sentAt: string | null
  reasons: string[]
  clearedAtMs: number
  onDismiss: () => void
}) {
  return (
    <section className="cleared" data-testid="withdraw-cleared">
      <div className="cleared-card">
        <p className="section-label">✓ {t(lang, s.clearedLabel)} · {formatTime(clearedAtMs)}</p>
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
            {formatTime(clearedAtMs)} {t(lang, s.seenGone)}
          </li>
        </ul>
      </div>
      <button type="button" className="btn secondary" onClick={onDismiss} data-testid="withdraw-cleared-ok">
        {t(lang, s.standingBy)}
      </button>
    </section>
  )
}

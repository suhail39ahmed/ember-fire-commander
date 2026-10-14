import { useEffect, useRef, useState } from 'react'
import { strings, t, type Lang } from './i18n'

/**
 * Full-screen WITHDRAW. Shown when the digest has an active incident.withdraw
 * naming this volunteer, or a withdraw task. The text is the backend's
 * instruction, verbatim; nothing here is computed on the phone.
 */
export function WithdrawScreen({ instruction, lang }: { instruction: string | null; lang: Lang }) {
  const btn = useRef<HTMLButtonElement>(null)
  const [acked, setAcked] = useState(false)

  useEffect(() => {
    btn.current?.focus()
    if ('vibrate' in navigator) navigator.vibrate([400, 200, 400, 200, 400])
  }, [])

  return (
    <div className="withdraw" role="alertdialog" aria-modal="true" aria-labelledby="withdraw-title" aria-describedby="withdraw-instruction">
      <p className="withdraw-label">{t(lang, strings.withdrawLabel)}</p>
      <h1 id="withdraw-title">{t(lang, strings.withdrawTitle)}</h1>
      {instruction && <p id="withdraw-instruction" className="withdraw-instruction">{instruction}</p>}
      <p className="withdraw-why">{t(lang, strings.withdrawWhy)}</p>
      {/* Acknowledgement is local only; the contract has no acknowledgement route yet. */}
      <button ref={btn} type="button" className="btn inverse" onClick={() => setAcked(true)} disabled={acked}>
        {acked ? t(lang, strings.withdrawAcked) : t(lang, strings.withdrawAck)}
      </button>
      <p className="badge-simulated on-dark">{t(lang, strings.simulated)}</p>
    </div>
  )
}

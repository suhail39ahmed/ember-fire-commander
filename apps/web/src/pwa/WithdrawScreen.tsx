import { useEffect } from 'react'

import { t, type Lang } from './i18n'
import { useVolunteer } from './layout/volunteerContext'
import { ConfirmSafe, HelpSent, WithdrawCover } from './screens/WithdrawViews'
import { screenStrings } from './screens/strings'
import { othersCount } from './withdraw/state'
import type { WithdrawFlow } from './withdraw/useWithdrawFlow'

/**
 * Full-screen WITHDRAW, drawn over the tabs. The text is the backend's instruction, verbatim; the only things the
 * phone adds are the answers the volunteer gives (#146 to #148).
 */
export function WithdrawScreen({ lang, flow }: { lang: Lang; flow: WithdrawFlow }) {
  const { volunteerId, talk } = useVolunteer()
  const { active, step, action, answeredAt, supervisorSafe, position, batteryPct, answer } = flow

  useEffect(() => {
    if (step === 'cover' && 'vibrate' in navigator) navigator.vibrate([400, 200, 400, 200, 400])
  }, [step])

  if (!active) return null
  const w = active.withdraw
  if (step === 'confirm') {
    return <ConfirmSafe lang={lang} instruction={active.instruction} sentAt={w?.sentAt ?? null} action={action} onSafe={() => answer('safe')} onStuck={() => answer('stuck')} />
  }
  if (step === 'stuck') {
    return <HelpSent lang={lang} answeredAt={answeredAt} position={position} batteryPct={batteryPct} action={action} talk={talk} onOut={() => answer('safe')} />
  }
  const note = step === 'safe' ? t(lang, supervisorSafe && !answeredAt ? screenStrings.withdraw.notedBySupervisor : screenStrings.withdraw.noted) : null
  return (
    <WithdrawCover
      lang={lang}
      instruction={active.instruction}
      sentAt={w?.sentAt ?? null}
      source={w?.source ?? null}
      reasons={w?.reasons ?? []}
      others={othersCount(w, volunteerId)}
      note={note}
      talk={talk}
    />
  )
}

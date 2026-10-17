import { useEffect } from 'react'
import './withdraw/withdraw.css'

import { type Lang } from './i18n'
import { useVolunteer } from './layout/volunteerContext'
import { ConfirmSafe, HelpSent, SafeWaiting, WithdrawCover } from './screens/WithdrawViews'
import { othersCount } from './withdraw/state'
import type { WithdrawFlow } from './withdraw/useWithdrawFlow'

/**
 * Full-screen WITHDRAW, drawn over the tabs. The text is the backend's instruction, verbatim; the only things the
 * phone adds are the answers the volunteer gives (#146 to #148).
 */
export function WithdrawScreen({ lang, flow }: { lang: Lang; flow: WithdrawFlow }) {
  const { volunteerId, talk, digest } = useVolunteer()
  const { active, step, action, answeredAt, supervisorSafe, position, batteryPct, answer } = flow

  useEffect(() => {
    if (step === 'cover' && 'vibrate' in navigator) navigator.vibrate([400, 200, 400, 200, 400])
  }, [step])

  const activeIncidentId = active?.incidentId
  useEffect(() => {
    if (!activeIncidentId) return
    const panel = document.querySelector<HTMLElement>('.withdraw')
    if (!panel) return
    const buttons = () => Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]'))
    ;(buttons()[0] ?? panel).focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation() }
      if (event.key !== 'Tab') return
      const focusable = buttons()
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (!first) { event.preventDefault(); panel.focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => document.removeEventListener('keydown', trap)
  }, [step, activeIncidentId])

  if (!active) return null
  const w = active.withdraw
  if (step === 'confirm') {
    return <ConfirmSafe weather={w?.weather} lang={lang} instruction={active.instruction} sentAt={w?.sentAt ?? null} action={action} onSafe={() => answer('safe')} onStuck={() => answer('stuck')} />
  }
  if (step === 'safe') {
    const safe = new Set([...(w?.safeVolunteerIds ?? []), ...(w?.selfSafeVolunteerIds ?? []), ...(volunteerId ? [volunteerId] : [])])
    const helping = Object.values(w?.helpers ?? {}).includes(volunteerId ?? '')
    const instruction = helping ? digest?.myTasks.filter((task) => task.type === 'instruct' && task.incidentId === active.incidentId).slice(-1)[0]?.instruction : null
    return <SafeWaiting lang={lang} supervisorSafe={supervisorSafe} answeredAt={answeredAt} confirmed={safe.size} total={w?.volunteerIds.length ?? 1} talk={talk} helpInstruction={instruction} />
  }
  if (step === 'stuck') {
    return <HelpSent lang={lang} answeredAt={answeredAt} position={position} batteryPct={batteryPct} action={action} talk={talk} onOut={() => answer('safe')} />
  }
  const note = null
  return (
    <WithdrawCover
      lang={lang}
      instruction={active.instruction}
      sentAt={w?.sentAt ?? null}
      source={w?.source ?? null}
      reasons={w?.reasons ?? []}
      others={othersCount(w, volunteerId)}
      note={note}
      weather={w?.weather}
      talk={talk}
    />
  )
}

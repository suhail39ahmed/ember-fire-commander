import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { EmberApi } from '../api/types'
import type { Digest, Task } from '../contracts/types'
import type { ActionState } from '../screens/actionState'
import { useDevicePosition } from '../screens/useDevicePosition'
import {
  REMIND_EVERY_MS,
  SHARE_EVERY_MS,
  WithdrawMemory,
  findWithdraw,
  stepOf,
  withdrawKey,
  type ActiveWithdraw,
  type AnswerState,
  type ShownWithdraw,
  type WithdrawStep,
} from './state'

export interface WithdrawFlow {
  active: ActiveWithdraw | null
  step: WithdrawStep
  /** A supervisor marked this volunteer safe (incident.withdraw.safeVolunteerIds). */
  supervisorSafe: boolean
  action: ActionState
  /** When the volunteer's answer was recorded (ISO), or null before one. */
  answeredAt: string | null
  /** When the phone showed the order, or null with no order. */
  shownAtMs: number | null
  /** An order the phone showed that has since left the digest, until the volunteer dismisses it. */
  cleared: (ShownWithdraw & { clearedAtMs: number }) | null
  /** Phone battery as a whole percent, or null where the browser does not say. */
  batteryPct: number | null
  /** The latest position fix, for the "sharing your location" line. */
  position: ReturnType<typeof useDevicePosition>
  answer: (state: AnswerState) => void
  dismissCleared: () => void
}

interface BatteryManager {
  level: number
}

/**
 * The WITHDRAW flow (#146 to #149). The first screen is the order. After CONFIRM_AFTER_MS without an answer the
 * phone asks "Are you upwind and safe?" and repeats the alarm. "I'm safe" and "I can't get out" go to ember-api;
 * while "can't get out" is on the phone sends its position again every SHARE_EVERY_MS. The phone only knows an
 * order is lifted when it leaves the digest, so that is the one thing the cleared screen waits for.
 */
export function useWithdrawFlow(input: { api: EmberApi; digest: Digest | null; volunteerId: string | null; task: Task | null }): WithdrawFlow {
  const { api, digest, volunteerId, task } = input
  const memory = useMemo(() => new WithdrawMemory(undefined, volunteerId ?? ''), [volunteerId])
  const active = useMemo(() => findWithdraw(digest, volunteerId, task), [digest, volunteerId, task])
  const key = active ? withdrawKey(active) : null
  const activeRef = useRef(active)
  activeRef.current = active
  const digestLoaded = digest !== null
  const digestRef = useRef(digest)
  digestRef.current = digest

  const [now, setNow] = useState(() => Date.now())
  const [answerState, setAnswerState] = useState<{ key: string; state: AnswerState; at: string } | null>(null)
  const [action, setAction] = useState<ActionState>({ kind: 'idle' })
  const [cleared, setCleared] = useState<WithdrawFlow['cleared']>(null)
  const [battery, setBattery] = useState<number | null>(null)
  const [shownAtMs, setShownAtMs] = useState<number | null>(null)

  // Remember the order that is on screen, and notice when it is gone.
  useEffect(() => {
    const active = activeRef.current
    if (active && key) {
      const stored = memory.shown()
      const at = stored && stored.key === key ? stored.shownAtMs : Date.now()
      setShownAtMs(at)
      setCleared(null)
      setAction({ kind: 'idle' })
      const saved = memory.answer(key)
      setAnswerState(saved ? { key, state: saved.state, at: saved.at } : null)
      memory.saveShown({
        key,
        incidentId: active.incidentId,
        sentAt: active.withdraw?.sentAt ?? null,
        source: active.withdraw?.source ?? null,
        reasons: active.withdraw?.reasons ?? [],
        instruction: active.instruction,
        shownAtMs: at,
      })
      return
    }
    setShownAtMs(null)
    if (!digestLoaded) return // nothing read yet, so nothing is known to be lifted
    const stored = memory.shown()
    if (!stored) {
      setCleared(null)
      return
    }
    const closed = digestRef.current?.incidents.find((i) => i.id === stored.incidentId)?.withdraw
    const clearedAtMs = closed?.clearedAt ? Date.parse(closed.clearedAt) : stored.clearedAtMs ?? Date.now()
    if (stored.clearedAtMs === undefined) memory.saveShown({ ...stored, clearedAtMs })
    setCleared({ ...stored, clearedAtMs, clearedByName: closed?.clearedByName, clearReason: closed?.clearReason })
  }, [key, digestLoaded, memory])

  const remoteAnswer = volunteerId ? active?.withdraw?.answers?.[volunteerId] : null
  const answerHere = remoteAnswer?.state ?? (answerState && answerState.key === key ? answerState.state : null)
  const answeredAt = remoteAnswer?.answeredAt ?? remoteAnswer?.at ?? (answerState && answerState.key === key ? answerState.at : null)
  const supervisorSafe = volunteerId !== null && (active?.withdraw?.safeVolunteerIds ?? []).includes(volunteerId)
  const ticking = active !== null && answerHere === null && !supervisorSafe
  useEffect(() => {
    if (!ticking) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [ticking])

  const step = active && shownAtMs !== null ? stepOf({ answer: answerHere, supervisorSafe, shownAtMs, nowMs: now }) : 'cover'

  // Repeat the alarm while the volunteer is asked and has not answered.
  useEffect(() => {
    if (step !== 'confirm' || typeof navigator === 'undefined' || !('vibrate' in navigator)) return
    navigator.vibrate([400, 200, 400])
    const id = setInterval(() => navigator.vibrate([400, 200, 400]), REMIND_EVERY_MS)
    return () => clearInterval(id)
  }, [step])

  const position = useDevicePosition(active !== null)
  const positionRef = useRef(position)
  positionRef.current = position
  const incidentId = active?.incidentId ?? null

  const body = useCallback((state: AnswerState) => {
    const p = positionRef.current
    const sessionId = activeRef.current?.withdraw?.id ?? activeRef.current?.withdraw?.sentAt
    return p.kind === 'ok' ? { state, sessionId, lat: p.lat, lng: p.lng, accuracyM: p.accuracyM } : { state, sessionId }
  }, [])

  const answering = useRef(false)
  const answer = useCallback(
    (state: AnswerState) => {
      if (!incidentId || !key || answering.current) return
      answering.current = true
      setAction({ kind: 'busy' })
      api
        .answerWithdraw(incidentId, body(state))
        .then(() => {
          const at = new Date().toISOString()
          memory.saveAnswer(key, state, at)
          setAnswerState({ key, state, at })
          setAction({ kind: 'idle' })
        })
        .catch(() => setAction({ kind: 'failed' }))
        .finally(() => { answering.current = false })
    },
    [api, incidentId, key, body, memory],
  )

  // Location updates never change a volunteer's safety answer.
  useEffect(() => {
    if (!key || !incidentId || !api.shareWithdrawLocation) return
    const share = () => {
      const p = positionRef.current
      if (p.kind === 'ok') void api.shareWithdrawLocation?.(incidentId, {
        sessionId: activeRef.current?.withdraw?.id ?? activeRef.current?.withdraw?.sentAt,
        lat: p.lat, lng: p.lng, accuracyM: p.accuracyM,
      }).catch(() => undefined)
    }
    share()
    const id = setInterval(share, step === 'safe' ? 60_000 : SHARE_EVERY_MS)
    return () => clearInterval(id)
  }, [key, incidentId, api, step])

  useEffect(() => {
    if (step !== 'stuck' || typeof navigator === 'undefined') return
    const reader = (navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }).getBattery
    if (!reader) return
    let live = true
    reader.call(navigator).then((b) => live && setBattery(Math.round(b.level * 100))).catch(() => undefined)
    return () => {
      live = false
    }
  }, [step])

  const dismissCleared = useCallback(() => {
    memory.clearShown()
    setCleared(null)
  }, [memory])

  return { active, step, action, answeredAt, supervisorSafe, shownAtMs, cleared, batteryPct: battery, position, answer, dismissCleared }
}

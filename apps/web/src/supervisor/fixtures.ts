/**
 * Synthetic console fixtures matching docs/demo/scenario.md. Fictional people and places.
 * normal: one open incident with a proposed dispatch.
 * conflict: Pak Dedi and Ibu Sari disagree, the incident is held and dispatch is held.
 * withdraw: the same incident after code issued WITHDRAW.
 */
import type { IncidentDetail, Observation, Task } from './contracts'

export type FixtureName = 'normal' | 'conflict' | 'withdraw'

const LAT = -1.849
const LNG = 110.051

const obsDedi: Observation = {
  id: 'obs_demo_01',
  volunteerId: 'uid_dedi',
  capturedAt: '2026-10-17T03:02:00Z',
  receivedAt: '2026-10-17T03:02:04Z',
  source: 'chip',
  lat: LAT,
  lng: LNG,
  accuracyM: 15,
  chip: 'api',
  text: 'Api kecil di parit belakang kebun',
  severity: 'small_flame',
  photoPath: null,
  immutable: true,
}

const obsSari: Observation = {
  id: 'obs_demo_02',
  volunteerId: 'uid_sari',
  capturedAt: '2026-10-17T03:05:00Z',
  receivedAt: '2026-10-17T03:05:03Z',
  source: 'chip',
  lat: -1.8495,
  lng: 110.0514,
  accuracyM: 22,
  chip: 'asap',
  text: 'Saya lihat asap saja, tidak ada api.',
  severity: 'smoke',
  photoPath: null,
  immutable: true,
}

const VERIFY_TEXT = 'Foto lebih lebar ke arah tanah. Jaga jarak aman. Katakan apakah api terlihat.'
const WITHDRAW_TEXT = 'MUNDUR sekarang ke titik kumpul di arah datangnya angin. Jangan padamkan sendiri.'

const task = (id: string, volunteerId: string, type: Task['type'], status: Task['status'], instruction: string): Task => ({
  id,
  incidentId: 'inc_demo_01',
  volunteerId,
  type,
  status,
  instruction,
})

const investigate = task('task_demo_investigate', 'uid_dedi', 'investigate', 'proposed', 'Check the ditch edge from the east road and report the fire line.')

export function fixture(name: FixtureName): IncidentDetail {
  if (name === 'normal') {
    return {
      incident: { id: 'inc_demo_01', status: 'open', severity: 'small_flame', evidenceScore: 41, conflictId: null, withdraw: null, lat: LAT, lng: LNG },
      observations: [structuredClone(obsDedi)],
      conflict: null,
      tasks: [structuredClone(investigate)],
    }
  }
  const conflict: IncidentDetail = {
    incident: { id: 'inc_demo_01', status: 'held', severity: 'small_flame', evidenceScore: 64, conflictId: 'con_demo_01', withdraw: null, lat: LAT, lng: LNG },
    observations: [structuredClone(obsDedi), structuredClone(obsSari)],
    conflict: {
      id: 'con_demo_01',
      incidentId: 'inc_demo_01',
      observationIds: [obsDedi.id, obsSari.id],
      higherSeverity: 'small_flame',
      status: 'open',
      dispatchHeld: true,
    },
    tasks: [
      task('task_demo_verify_dedi', 'uid_dedi', 'verify', 'proposed', VERIFY_TEXT),
      task('task_demo_verify_sari', 'uid_sari', 'verify', 'proposed', VERIFY_TEXT),
      structuredClone(investigate),
    ],
  }
  if (name === 'conflict') return conflict
  return {
    ...conflict,
    incident: {
      ...conflict.incident,
      severity: 'large_flame',
      evidenceScore: 82,
      withdraw: { active: true, instruction: WITHDRAW_TEXT, reasons: ['large flame reported'], volunteerIds: ['uid_dedi', 'uid_sari'] },
    },
    tasks: [
      ...conflict.tasks,
      task('task_demo_withdraw_dedi', 'uid_dedi', 'withdraw', 'approved', WITHDRAW_TEXT),
      task('task_demo_withdraw_sari', 'uid_sari', 'withdraw', 'approved', WITHDRAW_TEXT),
    ],
  }
}

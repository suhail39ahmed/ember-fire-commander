import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { formatTimeZone } from '../../pwa/formatTime'
import type { IncidentDetail, Observation, PhotoRead, VolunteerCardData } from '../contracts'
import { conditionsCopy } from '../detail/conditionsCopy'
import { airNote, airValue, weatherNote, windValue } from '../detail/conditionsModel'
import { profileLine } from '../detail/cardModel'
import { IncidentDetailView, type IncidentDetailViewProps } from '../detail/IncidentDetailView'
import { answerLine, batteryText, languageText, networkText, popupFor, visionLine } from '../detail/popupModel'
import { VolunteerPopup } from '../detail/VolunteerPopup'
import { factorName } from '../detail/disagreeCopy'
import { fixture } from '../fixtures'
import type { IncidentActions } from '../IncidentView'

const NOW = Date.parse('2026-10-17T03:10:00Z')
const actions: IncidentActions = { busyId: null, outcomes: {}, onApprove: () => undefined, onReject: () => undefined, saveEdit: async () => ({ task: fixture('normal').tasks[0], auditId: 'aud_1' } as never), onVerify: () => undefined }
const decision = { incident: fixture('normal').incident, auditId: 'aud_9' }

function view(detail: IncidentDetail, lang: 'id' | 'en' = 'en') {
  const props: IncidentDetailViewProps = {
    lang, incidentId: 'inc_demo_01', detail, queue: [detail.incident], failure: null, link: 'online', lastOkAt: NOW, now: NOW, actions,
    onRetry: () => undefined, onSelect: () => undefined, markSafe: async () => decision, resendTask: async () => ({ auditId: 'aud_3' }),
    sendWithdraw: async () => decision, actorName: 'Bu Maya', lowerSeverity: async () => decision, serverNow: () => NOW, extinguish: async () => decision,
    sendInstruction: async () => ({ task: fixture('normal').tasks[0], auditId: 'aud_i' }),
    photoUrl: async () => ({ url: 'https://photo.example/x.jpg', expiresAt: '2026-10-17T03:15:00Z' }),
  }
  return renderToStaticMarkup(<StaticRouter location="/console/incidents/inc_demo_01"><IncidentDetailView {...props} /></StaticRouter>)
}

function popup(detail: IncidentDetail, id: string, lang: 'id' | 'en' = 'en') {
  return renderToStaticMarkup(
    <VolunteerPopup
      lang={lang} detail={detail} volunteerId={id} onClose={() => undefined} offline={false} now={NOW}
      sendInstruction={async () => { throw new Error('unused') }} photoUrl={async () => { throw new Error('unused') }}
    />,
  )
}

const weather = { observedAt: '2026-10-17T03:00:00Z', windKmh: 12.4, windDirDeg: 225, windFrom: 'SW', gustKmh: 20.1, tempC: 31.2, humidityPct: 62, rainMm: 0, source: 'open-meteo' }
const air = { observedAt: '2026-10-17T03:00:00Z', psi24hMax: 88, pm25Max: 40, source: 'data.gov.sg' }

const sariCard = (over: Partial<VolunteerCardData> = {}): VolunteerCardData => ({
  volunteerId: 'uid_sari', name: 'Sari', reportCount: 1, firstReportAt: '2026-10-17T03:05:00Z', lastReportAt: '2026-10-17T03:05:00Z', lastSeverity: 'smoke',
  lastLat: -1.849, lastLng: 110.051, lastAccuracyM: 22, distanceM: 63, lastHeardAt: null, pushReady: true, withdraw: null,
  crewName: 'Tim Pompa A', teamRole: 'pump team', device: { batteryPct: 41, network: '3g', language: 'id', at: '2026-10-17T03:05:00Z' }, ...over,
})

describe('incident header and conditions', () => {
  it('shows the place, when it opened and what opened it, from the stored header', () => {
    const detail: IncidentDetail = { ...fixture('normal'), header: { code: '#1', placeName: 'Ketapang, Kalimantan Barat', openedAt: '2026-10-17T03:02:00Z', peopleOnSite: 3, source: 'chip' } }
    const html = view(detail)
    expect(html).toContain(`Ketapang, Kalimantan Barat · opened ${formatTimeZone('2026-10-17T03:02:00Z')} · from a quick chip`)
    expect(html).toContain('3 on site')
  })

  it('leaves out the parts of the header the API could not read', () => {
    const detail: IncidentDetail = { ...fixture('normal'), header: { code: '#1', placeName: 'Ketapang', openedAt: null, peopleOnSite: 0, source: null } }
    const html = view(detail)
    expect(html).toContain('<p class="inc-muted inc-meta">Ketapang</p>')
    expect(html).not.toContain('opened')
  })

  it('draws no header line for an older API', () => {
    expect(view(fixture('normal'))).not.toContain('inc-meta')
  })

  it('shows wind and air from the stored reads and says they are not measured at the incident', () => {
    const html = view({ ...fixture('normal'), conditions: { weather, air } })
    expect(html).toContain('12.4 km/h from SW')
    expect(html).toContain('Weather monitoring point reading, not measured at the incident')
    expect(html).toContain('gusts 20.1 km/h · 31.2 °C · humidity 62% · rain 0 mm')
    expect(html).toContain('24 h PSI 88')
    expect(html).toContain('National air-quality feed, not measured at the incident · highest PM2.5 40')
  })

  it('draws no wind or air card when nothing is stored, and no card for a part with no number', () => {
    expect(view({ ...fixture('normal'), conditions: { weather: null, air: null } })).not.toContain('Weather monitoring point')
    const html = view({ ...fixture('normal'), conditions: { weather: { ...weather, windKmh: null }, air: { ...air, psi24hMax: null } } })
    expect(html).not.toContain('Weather monitoring point')
    expect(html).not.toContain('National air-quality feed')
    expect(view(fixture('normal'))).not.toContain('Weather monitoring point')
  })

  it('speaks Bahasa', () => {
    const html = view({ ...fixture('normal'), conditions: { weather, air } }, 'id')
    expect(html).toContain('12.4 km/h dari SW')
    expect(html).toContain('Bacaan titik pantau cuaca, bukan di lokasi insiden')
    expect(conditionsCopy.windLabel.id).toBe('ANGIN')
  })

  it('words the readings with only what is stored', () => {
    expect(windValue('en', { ...weather, windFrom: null })).toBe('12.4 km/h')
    expect(windValue('en', { ...weather, windKmh: null })).toBeNull()
    expect(weatherNote('en', { ...weather, gustKmh: null, tempC: null, humidityPct: null, rainMm: null, observedAt: null })).toBe('')
    expect(airValue('en', { ...air, psi24hMax: null })).toBeNull()
    expect(airNote('en', { ...air, pm25Max: null })).toMatch(/^read at /)
  })
})

describe('evidence factors for wind and satellite', () => {
  it('names the two zero-point factors in both languages', () => {
    expect(factorName.wind).toEqual({ id: 'Angin', en: 'Wind' })
    expect(factorName.satellite).toEqual({ id: 'Satelit', en: 'Satellite' })
  })

  it('lists them with their sentence and 0 points', () => {
    const detail: IncidentDetail = {
      ...fixture('normal'),
      evidenceFactors: [
        { factor: 'severity', points: 35, detail: 'highest reported severity is small_flame' },
        { factor: 'wind', points: 0, detail: 'wind is 12.4 km/h at the weather station, not at the incident. It adds no points' },
        { factor: 'satellite', points: 0, detail: 'an unverified satellite lead was seen 900 m away at 02:10 UTC (confidence nominal). It adds no points' },
      ],
    }
    const html = view(detail)
    expect(html).toContain('>Wind</span>')
    expect(html).toContain('>Satellite</span>')
    expect(html).toContain('an unverified satellite lead was seen 900 m away')
    expect(html).toContain('<span class="why-points">0</span>')
  })
})

describe('volunteer card and profile from stored context', () => {
  it('shows crew, role, battery, network and language on the card, leaving out null parts', () => {
    expect(profileLine(sariCard())).toBe('Tim Pompa A · pump team · 41% · 3G · ID')
    expect(profileLine(sariCard({ crewName: null, teamRole: null, device: { batteryPct: null, network: 'wifi', language: null, at: null } }))).toBe('Wi-Fi')
    expect(profileLine(sariCard({ crewName: null, teamRole: null, device: null }))).toBeNull()
    expect(profileLine(sariCard({ crewName: undefined, teamRole: undefined, device: undefined }))).toBeNull()
    expect(profileLine(null)).toBeNull()
  })

  it('draws that line on the volunteer card in the detail', () => {
    const detail: IncidentDetail = { ...fixture('conflict'), volunteers: [sariCard()] }
    const html = view(detail)
    expect(html).toContain('Sari · pump team')
    expect(html).toContain('Tim Pompa A')
    expect(html).toContain('<span class="inc-vol-link">3G · 41%</span>')
  })

  it('fills the pop-up profile from the card, with the live signal winning over the report network', () => {
    const detail: IncidentDetail = { ...fixture('conflict'), volunteers: [sariCard()] }
    const html = popup(detail, 'uid_sari')
    expect(html).toContain('<dt>Role</dt><dd>pump team</dd>')
    expect(html).toContain('<dt>Crew</dt><dd>Tim Pompa A</dd>')
    expect(html).toContain('<dt>Network</dt><dd>3G</dd>')
    expect(html).toContain('<dt>Battery</dt><dd>41%</dd>')
    expect(html).toContain('<dt>Language</dt><dd>Indonesian</dd>')
    expect(html).toContain(`not a live reading. ${formatTimeZone('2026-10-17T03:05:00Z')}`)
    expect(html).not.toContain('A team role shows once')

    const live: IncidentDetail = {
      ...detail,
      liveSeat: { status: 'free', holderId: null, holderName: null, lastDrop: null, volunteers: { uid_sari: { signal: 'wifi', media: 'none', photoCadence: null, canRetry: false, canMakeLive: false } } } as never,
    }
    const profile = popupFor(live, 'uid_sari', 'en')!.profile
    expect(networkText(profile)).toBe('Wi-Fi')
    expect(networkText({ device: null, liveSignal: null })).toBeNull()
    const unknown = popupFor({ ...live, liveSeat: { ...live.liveSeat!, volunteers: { uid_sari: { ...live.liveSeat!.volunteers.uid_sari, signal: 'unknown' } } } }, 'uid_sari', 'en')!.profile
    expect(networkText(unknown)).toBe('3G')
  })

  it('words battery and language only when stored', () => {
    expect(batteryText(null)).toBeNull()
    expect(batteryText({ batteryPct: 0, network: null, language: null, at: null })).toBe('0%')
    expect(languageText('id', { batteryPct: null, network: null, language: 'en', at: null })).toBe('Bahasa Inggris')
    expect(languageText('en', { batteryPct: null, network: null, language: null, at: null })).toBeNull()
  })
})

describe('photo reads under a snapshot', () => {
  const photo: Observation = {
    id: 'obs_photo', volunteerId: 'uid_sari', capturedAt: '2026-10-17T03:07:00Z', receivedAt: '2026-10-17T03:07:03Z', source: 'photo',
    lat: -1.85, lng: 110.06, accuracyM: 9, chip: null, text: 'Foto parit', severity: 'unknown', photoPath: 'photos/uid_sari/obs_photo.jpg', immutable: true,
  }
  const read: PhotoRead = { smokeVisible: true, flameVisible: 'small', burnScarVisible: false, notes: 'Thin smoke beside a canal', at: '2026-10-17T03:08:00Z' }

  it('shows what the read said, marked advisory', () => {
    const detail: IncidentDetail = { ...fixture('conflict'), observations: [...fixture('conflict').observations, photo], photoReads: { obs_photo: read } }
    const html = popup(detail, 'uid_sari')
    expect(html).toContain('AI photo check')
    expect(html).toContain('smoke visible · small flame · “Thin smoke beside a canal”')
    expect(html).toContain('Describes the picture, not the incident severity.')
  })

  it('shows nothing when no read exists for the photo', () => {
    const detail: IncidentDetail = { ...fixture('conflict'), observations: [...fixture('conflict').observations, photo], photoReads: {} }
    expect(popup(detail, 'uid_sari')).not.toContain('AI photo check')
    expect(popup({ ...detail, photoReads: undefined }, 'uid_sari')).not.toContain('AI photo check')
  })

  it('words the read from the fields it has', () => {
    expect(visionLine('en', undefined)).toBeNull()
    expect(visionLine('en', { smokeVisible: null, flameVisible: null, burnScarVisible: null, notes: null, at: null })).toBeNull()
    expect(visionLine('id', { ...read, smokeVisible: false, flameVisible: 'unknown-value', burnScarVisible: true, notes: null })).toBe('tidak ada asap · bekas terbakar terlihat')
  })
})

describe('instruction history shows the volunteer’s answer', () => {
  const task = fixture('conflict').tasks[0]

  it('says accepted or declined with the reason and note, and nothing before an answer', () => {
    expect(answerLine('en', task, (v) => v)).toBeNull()
    expect(answerLine('en', { ...task, acceptedAt: '2026-10-17T03:09:00Z' }, () => '03:09')).toBe('Accepted 03:09')
    expect(answerLine('en', { ...task, declinedAt: '2026-10-17T03:09:00Z', declineReason: 'too_far', declineNote: ' Across the river ' }, () => '03:09')).toBe('Declined 03:09 · Too far / cannot get there · Across the river')
    expect(answerLine('id', { ...task, declinedAt: '2026-10-17T03:09:00Z', declineReason: null, declineNote: null }, () => '03:09')).toBe('Ditolak 03:09')
  })

  it('draws it in the pop-up under the instruction', () => {
    const detail = fixture('conflict')
    detail.tasks = detail.tasks.map((x) => (x.volunteerId === 'uid_sari' ? { ...x, declinedAt: '2026-10-17T03:09:00Z', declineReason: 'unsafe' as const, declineNote: null } : x))
    expect(popup(detail, 'uid_sari')).toContain(`Declined ${formatTimeZone('2026-10-17T03:09:00Z')} · Not safe here`)
  })
})

describe('all reports and when the disagreement opened', () => {
  const second: Observation = {
    id: 'obs_demo_03', volunteerId: 'uid_ayu', volunteerName: 'Ayu', capturedAt: '2026-10-17T03:06:00Z', receivedAt: '2026-10-17T03:06:02Z', source: 'text',
    lat: -1.8495, lng: 110.0514, accuracyM: 30, chip: null, text: 'Asap tebal dekat kanal', severity: 'unknown', photoPath: null, immutable: true,
  }
  const withContext = (audit: NonNullable<IncidentDetail['conflictContext']>['audit']): IncidentDetail => {
    const detail = fixture('conflict')
    detail.tasks = detail.tasks.filter((t) => t.type !== 'investigate')
    detail.conflictContext = { otherObservations: [second], allObservations: [...detail.observations, second], audit }
    return detail
  }
  const opened = { kind: 'audit' as const, id: 'aud_open', at: '2026-10-17T03:06:00Z', action: 'conflict.open' as const, actorId: 'code', actorName: null, volunteerId: null, taskId: null, severity: null, source: null, chip: null, text: null }

  it('lists every report, both sides included, in one list', () => {
    const html = view(withContext([]))
    expect(html).toContain('All reports at this incident')
    expect(html).toContain('3 · both sides included, oldest first')
    expect(html).toContain('<strong>Ayu</strong>')
    expect(html).toContain('“Asap tebal dekat kanal”')
    expect(html).not.toContain('Other reports at this incident')
  })

  it('keeps the other-reports cards for an older API with no full list', () => {
    const detail = withContext([])
    detail.conflictContext = { otherObservations: [second], audit: [] }
    const html = view(detail)
    expect(html).toContain('Other reports at this incident')
    expect(html).not.toContain('All reports at this incident')
  })

  it('shows the recorded opening as a decision row and drops the "no record" line', () => {
    const html = view(withContext([opened]))
    expect(html).toContain('Code · opened a disagreement, dispatch held')
    expect(html).not.toContain('No record shows when the disagreement opened.')
  })

  it('still says nothing recorded when a conflict predates the opening row', () => {
    expect(view(withContext([]))).toContain('No record shows when the disagreement opened.')
  })

  it('speaks Bahasa', () => {
    const html = view(withContext([opened]), 'id')
    expect(html).toContain('Semua laporan di insiden ini')
    expect(html).toContain('Kode · membuka perbedaan laporan, dispatch ditahan')
  })
})

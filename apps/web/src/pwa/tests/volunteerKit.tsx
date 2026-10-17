import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { beforeAll, vi } from 'vitest'

import type { EmberApi } from '../api/types'
import type { Digest, IncidentSummary, Task } from '../contracts/types'
import type { TalkView } from '../gateway/voiceView'
import { LANG_KEY } from '../i18n'
import { createLanguageStore } from '../language'
import { LanguageProvider } from '../LanguageProvider'
import { VolunteerContext, type VolunteerValue } from '../layout/volunteerContext'
import type { OutboxHandle } from '../outbox/useOutbox'

/** Test helpers for the volunteer screens. Not a test file, so vitest does not collect it. */
export const talkView: TalkView = { button: 'ready', label: { id: 'Tahan untuk bicara', en: 'Hold to talk' }, status: { id: 'Siap', en: 'Ready' }, disabled: false }

export function fakeApi(over: Partial<EmberApi> = {}): EmberApi {
  const fail = () => Promise.reject(new Error('not used in this test'))
  return {
    getDigest: fail,
    createObservation: fail,
    createUploadUrl: fail,
    markTaskHeard: fail,
    ...over,
  } as EmberApi
}

export function incident(over: Partial<IncidentSummary> = {}): IncidentSummary {
  return { id: 'inc_1', name: 'TOHOR-3 · Desa Tohor · #1', area: 'Desa Tohor', status: 'open', severity: 'small_flame', withdraw: null, lat: 1.5, lng: 102.1, ...over }
}

export function task(over: Partial<Task> = {}): Task {
  return { id: 'task_1', incidentId: 'inc_1', volunteerId: 'vol_1', type: 'verify', status: 'approved', instruction: 'Cek tepi kanal', ...over }
}

export function digest(over: Partial<Digest> = {}): Digest {
  return { updatedAt: '2026-10-16T08:00:00Z', incidents: [], myTasks: [], ...over }
}

export function outboxHandle(over: Partial<OutboxHandle> = {}): OutboxHandle {
  const noop = async () => undefined
  return { items: [], online: true, submit: async () => 'sent', queuePhoto: noop, retry: noop, discard: noop, flush: noop, ...over }
}

export function volunteerValue(over: Partial<VolunteerValue> = {}): VolunteerValue {
  return {
    api: fakeApi(),
    me: { id: 'vol_1', displayName: 'Pak Dedi', role: 'volunteer', crewName: 'Regu Tohor' },
    volunteerId: 'vol_1',
    digest: digest(),
    digestStatus: 'ready',
    lastSyncAt: '2026-10-16T08:00:00Z',
    refresh: () => undefined,
    position: { kind: 'ok', lat: 1.5, lng: 102.1, accuracyM: 10 },
    outbox: outboxHandle(),
    upload: async () => undefined,
    perms: { microphone: 'granted', camera: 'prompt', location: 'granted', notifications: 'denied' },
    asking: {},
    requestPermission: () => undefined,
    talk: { view: talkView, onPress: () => undefined, onRelease: () => undefined },
    mock: undefined,
    ...over,
  } as VolunteerValue
}

export function renderVolunteer(node: React.ReactNode, { path = '/pwa', lang = 'en', value = volunteerValue() }: { path?: string; lang?: 'id' | 'en'; value?: VolunteerValue } = {}): string {
  const data = new Map([[LANG_KEY, lang]])
  const store = createLanguageStore({ storage: { getItem: (k) => data.get(k) ?? null, setItem: () => {} }, root: { lang: '' } })
  return renderToStaticMarkup(
    <LanguageProvider store={store}>
      <VolunteerContext.Provider value={value}>
        <StaticRouter location={path}>{node}</StaticRouter>
      </VolunteerContext.Provider>
    </LanguageProvider>,
  )
}

/** Static rendering runs in node. Screens read `navigator` for the install hint and the platform, so give them a plain phone. */
export function fakeBrowser(userAgent = 'Mozilla/5.0 (Linux; Android 14) Chrome/120') {
  beforeAll(() => {
    vi.stubGlobal('navigator', { userAgent, onLine: true, platform: 'Linux armv8l', maxTouchPoints: 5 })
  })
}

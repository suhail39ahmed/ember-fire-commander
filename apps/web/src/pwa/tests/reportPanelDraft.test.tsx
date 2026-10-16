import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { EmberApi } from '../api/types'
import { DRAFT_KEY } from '../report/draft'
import { ReportPanel } from '../report/ReportPanel'

const api = {} as EmberApi
const locate = async () => ({ kind: 'unavailable' as const })

function useStorage(entries: Record<string, string>) {
  const data = new Map(Object.entries(entries))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  })
}

const render = (volunteerId: string | null) =>
  renderToStaticMarkup(<ReportPanel api={api} lang="en" locate={locate} volunteerId={volunteerId} />)

const saved = (volunteerId: string, savedAt = new Date().toISOString()) =>
  JSON.stringify({ volunteerId, chip: 'api', text: 'Api kecil di ladang', savedAt })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ReportPanel draft', () => {
  it('opens with the chip and note this volunteer left behind', () => {
    useStorage({ [DRAFT_KEY]: saved('vol_dedi') })
    const html = render('vol_dedi')
    expect(html).toContain('value="Api kecil di ladang"')
    expect(html).toMatch(/aria-checked="true"[^>]*data-chip="api"|data-chip="api"[^>]*aria-checked="true"/)
  })

  it('opens empty for another volunteer', () => {
    useStorage({ [DRAFT_KEY]: saved('vol_dedi') })
    expect(render('vol_other')).not.toContain('Api kecil di ladang')
  })

  it('opens empty when the draft is older than an hour', () => {
    useStorage({ [DRAFT_KEY]: saved('vol_dedi', new Date(Date.now() - 61 * 60_000).toISOString()) })
    expect(render('vol_dedi')).not.toContain('Api kecil di ladang')
  })

  it('keeps nothing between visits without a volunteer id', () => {
    useStorage({ [DRAFT_KEY]: saved('vol_dedi') })
    expect(render(null)).not.toContain('Api kecil di ladang')
  })
})

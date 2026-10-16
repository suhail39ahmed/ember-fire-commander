import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { emptySeasonImpact } from '../chromeClient'
import { SeasonImpact } from '../SeasonImpact'

function html(props: Partial<ComponentProps<typeof SeasonImpact>> = {}) {
  return renderToStaticMarkup(
    <SeasonImpact impact={emptySeasonImpact()} loading={false} retrying={false} lang="en" {...props} />,
  )
}

describe('season impact', () => {
  it('shows the five labels and an em dash for every missing value', () => {
    const markup = html()
    expect(markup).toContain('Season impact')
    expect(markup).toContain('Since — · — · — village crews')
    expect(markup).toContain('How we count')
    expect(markup).toContain('Fires contained')
    expect(markup).toContain('False alarms cleared')
    expect(markup).toContain('Volunteer injuries')
    expect(markup).toContain('Median time to human check')
    expect(markup).toContain('Re-ignitions caught')
    expect(markup.match(/—/g)?.length).toBeGreaterThanOrEqual(12)
    expect(markup).not.toContain('37')
    expect(markup).not.toContain('112')
    expect(markup).not.toContain('18m')
    expect(markup).not.toContain('Riau')
  })

  it('shows the stored figures, notes, region, and a short season start date', () => {
    const markup = html({
      impact: {
        ...emptySeasonImpact(),
        since: '2026-10-14T12:00:00.000Z',
        region: 'Riau',
        crewCount: 4,
        firesContained: 2,
        firesContainedNote: 'Extinguished by a supervisor, of 4 incidents',
        medianTimeToHumanCheck: '20 min',
      },
    })
    expect(markup).toContain('Since 14 Oct · Riau · 4 village crews')
    expect(markup).toContain('Extinguished by a supervisor, of 4 incidents')
    expect(markup).toContain('20 min')
    expect(markup).not.toContain('2026-10-14')
  })

  it('shows a loading line without figures before the first read', () => {
    const markup = html({ impact: null, loading: true })
    expect(markup).toContain('Loading season impact…')
    expect(markup).not.toContain('Fires contained')
  })

  it('keeps the last picture and says it is retrying', () => {
    const markup = html({ retrying: true })
    expect(markup).toContain('Fires contained')
    expect(markup).toContain('Showing the last season impact. Retrying.')
  })

  it('does not invent figures when the first read fails', () => {
    const markup = html({ impact: null, loading: false, retrying: true })
    expect(markup).toContain('Could not load season impact. Retrying.')
    expect(markup).not.toContain('Fires contained')
  })
})
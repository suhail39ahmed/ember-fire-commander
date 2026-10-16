import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Charts } from '../Charts'
import { emptyCharts } from '../chromeClient'

function html(props: Partial<ComponentProps<typeof Charts>> = {}) {
  return renderToStaticMarkup(
    <Charts charts={emptyCharts()} loading={false} retrying={false} lang="en" {...props} />,
  )
}

describe('dashboard charts', () => {
  it('shows the four labels and an em dash for every missing figure', () => {
    const markup = html()
    expect(markup).toContain('Satellite leads this week')
    expect(markup).toContain('Time to human check')
    expect(markup).toContain('Crews right now')
    expect(markup).toContain('Weather now')
    expect(markup).toContain('M T W T F S S · —')
    expect(markup).toContain('Real fire —')
    expect(markup).toContain('Dismissed —')
    expect(markup).toContain('Today — · target —')
    expect(markup).toContain('On site —')
    expect(markup).toContain('Air temp —')
    expect(markup).not.toContain('24')
    expect(markup).not.toContain('18')
    expect(markup).not.toContain('°')
    expect(markup).not.toContain('<svg')
  })

  it('shows a loading line without figures before the first read', () => {
    const markup = html({ charts: null, loading: true })
    expect(markup).toContain('Loading charts…')
    expect(markup).not.toContain('Weather now')
  })

  it('keeps the last picture and says it is retrying', () => {
    const markup = html({ retrying: true })
    expect(markup).toContain('Crews right now')
    expect(markup).toContain('Showing the last charts. Retrying.')
  })

  it('does not invent figures when the first read fails', () => {
    const markup = html({ charts: null, loading: false, retrying: true })
    expect(markup).toContain('Could not load charts. Retrying.')
    expect(markup).not.toContain('Weather now')
  })
})

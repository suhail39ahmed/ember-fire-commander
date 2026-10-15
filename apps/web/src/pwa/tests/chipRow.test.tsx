import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CHIP_VALUES } from '../contracts/types'
import { ChipRow } from '../report/ChipRow'

const render = (props: Partial<Parameters<typeof ChipRow>[0]> = {}) =>
  renderToStaticMarkup(<ChipRow value={null} labelledBy="label" onChange={() => {}} {...props} />)

describe('ChipRow', () => {
  it('renders the four chips as one radio group', () => {
    const html = render()
    expect(html.match(/role="radio"/g)).toHaveLength(CHIP_VALUES.length)
    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('aria-labelledby="label"')
  })

  it('keeps the wire value on each chip', () => {
    const html = render()
    for (const c of CHIP_VALUES) expect(html).toContain(`data-chip="${c}"`)
  })

  it('puts the tick inside the chosen chip and nowhere else', () => {
    const html = render({ value: 'api' })
    const buttons = html.split('<button').slice(1)
    const ticks = buttons.filter((b) => b.includes('✓'))
    expect(ticks).toHaveLength(1)
    expect(ticks[0]).toContain('data-chip="api"')
    expect(ticks[0]).toContain('aria-checked="true"')
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
  })

  it('reserves the same mark slot on every chip so choosing one does not change its width', () => {
    const html = render({ value: 'asap' })
    expect(html.match(/class="chip-mark"/g)).toHaveLength(CHIP_VALUES.length)
  })

  it('shows no tick when nothing is chosen', () => {
    expect(render()).not.toContain('✓')
  })

  it('marks every chip invalid and disables them on request', () => {
    const html = render({ invalid: true, disabled: true })
    expect(html.match(/chip invalid/g)).toHaveLength(CHIP_VALUES.length)
    expect(html.match(/disabled=""/g)).toHaveLength(CHIP_VALUES.length)
  })
})

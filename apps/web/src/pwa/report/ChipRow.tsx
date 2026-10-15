import { CHIP_VALUES, type ChipValue } from '../contracts/types'
import { CHIP_ID_LABEL } from './chips'
import './report.css'

interface Props {
  value: ChipValue | null
  disabled?: boolean
  invalid?: boolean
  labelledBy: string
  describedBy?: string
  onChange: (next: ChipValue | null) => void
}

/**
 * The four quick-report chips. The leading mark is always present: a colour dot,
 * or a tick when the chip is chosen. Choosing a chip therefore never changes its
 * width, and the tick can never spill onto the next chip. The row wraps when the
 * screen is narrow.
 */
export function ChipRow({ value, disabled, invalid, labelledBy, describedBy, onChange }: Props) {
  return (
    <div className="chips" role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      {CHIP_VALUES.map((c) => {
        const selected = value === c
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            data-chip={c}
            className={`chip${selected ? ' selected' : ''}${invalid ? ' invalid' : ''}`}
            onClick={() => onChange(selected ? null : c)}
          >
            <span className="chip-mark" aria-hidden="true">
              {selected ? '✓' : ''}
            </span>
            <span className="chip-text">{CHIP_ID_LABEL[c]}</span>
          </button>
        )
      })}
    </div>
  )
}

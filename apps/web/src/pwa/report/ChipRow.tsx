import { CHIP_VALUES, type ChipValue } from '../contracts/types'
import type { Lang } from '../i18n'
import { chipHint, chipLabel } from './chips'
import './report.css'

interface Props {
  lang: Lang
  value: ChipValue | null
  disabled?: boolean
  invalid?: boolean
  labelledBy: string
  describedBy?: string
  onChange: (next: ChipValue | null) => void
}

const ICONS: Record<ChipValue, string> = {
  asap: 'M4 8c2-1.6 4 1.6 6 0s4 1.6 6 0 3 .8 4 0M4 13c2-1.6 4 1.6 6 0s4 1.6 6 0 3 .8 4 0M4 18c2-1.6 4 1.6 6 0s4 1.6 6 0 3 .8 4 0',
  api: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  aman: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM8.5 12l2.5 2.5L15.5 10',
  butuh_bantuan: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5v5.5M12 16.2v.1',
}

/**
 * The four quick-report cards. The leading mark is always present: a colour dot,
 * or a tick when the chip is chosen. Choosing a chip therefore never changes its
 * width, and the tick can never spill onto the next chip. The row wraps when the
 * screen is narrow.
 */
export function ChipRow({ lang, value, disabled, invalid, labelledBy, describedBy, onChange }: Props) {
  return (
    <div className="chips" role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      {CHIP_VALUES.map((c) => {
        const selected = value === c
        const label = chipLabel(c, lang)
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
            <span className="chip-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={ICONS[c]} />
              </svg>
            </span>
            <span className="chip-mark" aria-hidden="true">
              {selected ? '✓' : ''}
            </span>
            <span className="chip-text">
              <span className="chip-primary">{label.primary}</span>
              {label.secondary && (
                <span className="chip-secondary" lang="id">
                  {label.secondary}
                </span>
              )}
              <span className="chip-desc">{chipHint(c, lang)}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

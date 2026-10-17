import { CHIP_VALUES, type ChipValue } from '../contracts/types'
import type { Lang } from '../i18n'
import { chipLabel } from './chips'
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

/**
 * The four quick-report chips. The leading mark is always present: a colour dot,
 * or a tick when the chip is chosen. Choosing a chip therefore never changes its
 * width, and the tick can never spill onto the next chip. The row wraps when the
 * screen is narrow.
 */
export function ChipRow({ lang, value, disabled, invalid, labelledBy, describedBy, onChange }: Props) {
  const detail: Record<ChipValue, { en: string; id: string; icon: string }> = {
    asap: { en: 'Smoke, no flames yet', id: 'Asap, belum ada api', icon: '≋' },
    api: { en: 'I can see flames', id: 'Saya melihat api', icon: '🔥' },
    aman: { en: 'No fire here, or it is out', id: 'Tidak ada api, atau sudah padam', icon: '✓' },
    butuh_bantuan: { en: 'I need help right now', id: 'Saya perlu bantuan sekarang', icon: '!' },
  }
  return (
    <div className="chips report-choices" role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy}>
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
            <span className="chip-mark" aria-hidden="true">
              {selected ? '✓' : ''}
            </span>
            <span className="chip-symbol" aria-hidden="true">{detail[c].icon}</span>
            <span className="chip-text">
              <span className="chip-primary">{label.primary}</span>
              {label.secondary && (
                <span className="chip-secondary" lang="id">
                  {label.secondary}
                </span>
              )}
              <span className="chip-description">{lang === 'en' ? detail[c].en : detail[c].id}</span>
            </span>
            <span className="chip-radio" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

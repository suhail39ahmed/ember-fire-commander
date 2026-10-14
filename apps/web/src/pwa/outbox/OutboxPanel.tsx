import { t, type Lang } from '../i18n'
import { outboxStrings as s } from './strings'
import { capturedAtOf, type OutboxItem } from './types'
import './outbox.css'

const CHIP_LABEL = { asap: 'asap', api: 'api', aman: 'aman', butuh_bantuan: 'butuh bantuan' } as const

function describe(item: OutboxItem, lang: Lang): string {
  const body = item.body
  if (!body) return t(lang, s.photoWaiting)
  if (body.source === 'photo') return t(lang, s.photo)
  if (body.chip) return body.text ? `${CHIP_LABEL[body.chip]} · ${body.text}` : CHIP_LABEL[body.chip]
  return `${t(lang, s.text)} · ${body.text ?? ''}`
}

interface Props {
  items: OutboxItem[]
  online: boolean
  lang: Lang
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
  onSendNow: () => void
}

/** #21: queued, failed and sent reports. Shown only when the outbox has something or the phone is offline. */
export function OutboxPanel({ items, online, lang, onRetry, onDiscard, onSendNow }: Props) {
  if (items.length === 0 && online) return null
  const queued = items.some((i) => i.state === 'queued')
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(lang === 'id' ? 'id-ID' : 'en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <section className="card outbox" aria-labelledby="outbox-label">
      <h3 id="outbox-label" className="section-label">
        {t(lang, s.label)}
      </h3>
      {!online && (
        <p className="outbox-offline" role="status">
          {t(lang, s.offline)}
        </p>
      )}
      {items.length > 0 && (
        <ul className="outbox-list">
          {items.map((item) => (
            <li key={item.id} className={`outbox-item outbox-${item.state}`}>
              <div className="outbox-row">
                <span className="outbox-what">{describe(item, lang)}</span>
                <span className="outbox-state" aria-live="polite">
                  {t(lang, s.state[item.state])}
                </span>
              </div>
              <span className="muted small">
                {time(capturedAtOf(item))}
                {item.state === 'failed' && item.lastError ? ` · ${item.lastError}` : ''}
              </span>
              {item.state === 'failed' && (
                <div className="outbox-actions">
                  <button type="button" className="btn small" onClick={() => onRetry(item.id)}>
                    {t(lang, s.retry)}
                  </button>
                  <button type="button" className="btn small" onClick={() => onDiscard(item.id)}>
                    {t(lang, s.discard)}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {queued && online && (
        <button type="button" className="btn secondary" onClick={onSendNow}>
          {t(lang, s.sendNow)}
        </button>
      )}
    </section>
  )
}

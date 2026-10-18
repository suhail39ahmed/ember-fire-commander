import { t, type Lang } from '../i18n'
import { chipText } from '../report/chips'
import { outboxStrings as s } from './strings'
import type { OutboxItem } from './types'

/** One line saying what an outbox entry is, in the current language. */
export function describeItem(item: OutboxItem, lang: Lang): string {
  if (item.taskCompletion) return lang === 'en' ? 'Task details & completion' : 'Rincian & penyelesaian tugas'
  const body = item.body
  if (!body) {
    if (item.video) return t(lang, s.videoWaiting)
    return t(lang, s.photoWaiting)
  }
  if (body.source === 'photo') return t(lang, s.photo)
  if (body.source === 'video') return t(lang, s.video)
  if (body.chip) return body.text ? `${chipText(body.chip, lang)} · ${body.text}` : chipText(body.chip, lang)
  return `${t(lang, s.text)} · ${body.text ?? ''}`
}

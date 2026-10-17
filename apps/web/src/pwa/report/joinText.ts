import { t, type Lang } from '../i18n'
import { screenStrings } from '../screens/strings'
import type { JoinResult } from './joinResult'

const c = screenStrings.sentCard

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))

/**
 * What ember-api recorded about where a report went, in one or two sentences: the incident, how many other reports were
 * within the join radius and the nearest one. Only recorded numbers are used.
 */
export function joinSentence(lang: Lang, join: JoinResult): string {
  const radius = join.radiusM
  if (!join.joined) return fill(t(lang, c.startedLine), { radius })
  const first = fill(t(lang, c.joinedLine), { label: join.label })
  if (join.nearbyCount <= 0 || join.nearestM === null) return `${first} ${fill(t(lang, c.nearNone), { radius })}`
  const template = join.nearbyCount === 1 ? c.nearOne : c.nearMany
  return `${first} ${fill(t(lang, template), { count: join.nearbyCount, radius, nearest: join.nearestM })}`
}

/** The short line under a "Sent today" row: the nearby count within the radius, or that it started an incident. */
export function joinShort(lang: Lang, join: JoinResult): string {
  if (!join.joined) return fill(t(lang, c.startedLine), { radius: join.radiusM })
  if (join.nearbyCount <= 0 || join.nearestM === null) return fill(t(lang, c.nearNone), { radius: join.radiusM })
  return fill(t(lang, join.nearbyCount === 1 ? c.nearOne : c.nearMany), { count: join.nearbyCount, radius: join.radiusM, nearest: join.nearestM })
}

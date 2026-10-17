import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DigestNotice } from '../DigestNotice'

/** The stylesheet source. Read from disk because the test runner does not return CSS for imports. */
const css = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const outboxCss = css('outbox/outbox.css')
const photoCss = css('photo/photo.css')
const permissionsCss = css('permissions/permissions.css')
const reportCss = css('report/report.css')
const talkCss = css('gateway/talk.css')
const volunteerCss = css('volunteer.css')
const languageCss = css('language.css')

/** Reads `prop` from the first rule whose selector is exactly `selector`. */
function declaration(css: string, selector: string, prop: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rule = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  if (!rule) return undefined
  return new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`).exec(rule[1])?.[1].trim()
}

/** The custom properties declared on `.vol`. */
function tokens(css: string): Record<string, string> {
  const block = /\n\.vol \{([^}]*)\}/.exec(css)?.[1] ?? ''
  const found: Record<string, string> = {}
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) found[match[1]] = match[2].trim()
  return found
}

function resolve(value: string | undefined, vars: Record<string, string>): string {
  if (!value) throw new Error('missing value')
  const ref = /^var\((--[\w-]+)\)$/.exec(value)
  const out = ref ? vars[ref[1]] : value
  if (!out) throw new Error(`unknown token in ${value}`)
  return out.length === 4 ? `#${out[1]}${out[1]}${out[2]}${out[2]}${out[3]}${out[3]}` : out
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const vars = tokens(volunteerCss)
const pair = (css: string, selector: string, fgSelector = selector, bgSelector = selector) => ({
  fg: resolve(declaration(css, fgSelector, 'color'), vars),
  bg: resolve(declaration(css, bgSelector, 'background'), vars),
})

describe('contrast of small text (WCAG AA, 4.5:1)', () => {
  it('reads the colour tokens from the stylesheet', () => {
    expect(vars['--ember']).toBe('#e2531b')
    expect(vars['--paper']).toBe('#faf7f2')
  })

  it.each([
    ['simulated badge', pair(volunteerCss, '.badge-simulated')],
    ['safe tip', pair(volunteerCss, '.tip')],
    ['report sent title', pair(volunteerCss, '.sent strong', '.sent strong', '.sent')],
    ['queued report title', { fg: resolve(declaration(outboxCss, '.sent.queued strong', 'color'), vars), bg: resolve(declaration(outboxCss, '.sent.queued', 'background'), vars) }],
    ['muted text on a card', { fg: resolve('var(--ink-muted)', vars), bg: '#ffffff' }],
    ['muted text on the page', { fg: resolve('var(--ink-muted)', vars), bg: resolve('var(--paper)', vars) }],
    ['error text on a card', { fg: resolve('var(--danger)', vars), bg: '#ffffff' }],
  ])('%s is readable', (_name, { fg, bg }) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('computes the ratio correctly', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrast('#ffffff', '#b7791f')).toBeLessThan(4.5)
  })
})

describe('focus ring', () => {
  it('shows a 2px ring on every focusable control, white on the red WITHDRAW surface', () => {
    expect(volunteerCss).toContain('.vol :focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }')
    expect(declaration(volunteerCss, '.withdraw :focus-visible', 'outline-color')).toBe('#fff')
  })

  it('does not switch the outline off anywhere in the volunteer styles', () => {
    for (const css of [volunteerCss, reportCss, photoCss, outboxCss, permissionsCss, talkCss, languageCss]) {
      expect(css).not.toMatch(/outline\s*:\s*(none|0)\b/)
    }
  })
})

describe('reduced motion', () => {
  it('turns off every animation and transition under .vol', () => {
    const rule = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(volunteerCss)?.[1] ?? ''
    expect(rule).toContain('animation: none !important')
    expect(rule).toContain('transition: none !important')
    expect(rule).toContain('.vol *')
  })
})

describe('tap targets', () => {
  const size = (css: string, selector: string) => Number.parseInt(declaration(css, selector, 'height') ?? declaration(css, selector, 'min-height') ?? '0', 10)

  it.each([
    ['.btn', volunteerCss],
    ['.btn.small', volunteerCss],
    ['.perm-btn', permissionsCss],
    ['.chip', reportCss],
    ['.lang-toggle-option', languageCss],
  ])('%s is at least 44px tall', (selector, css) => {
    expect(size(css, selector)).toBeGreaterThanOrEqual(44)
  })
})

describe('DigestNotice', () => {
  const render = (status: Parameters<typeof DigestNotice>[0]['status'], hasDigest = false) =>
    renderToStaticMarkup(<DigestNotice status={status} hasDigest={hasDigest} lang="en" onRetry={() => {}} />)

  it('keeps a polite live region on the page and puts the loading line inside it', () => {
    const html = render('loading')
    expect(html).toContain('aria-live="polite"')
    expect(html).toMatch(/aria-live="polite"[^>]*>.*Loading your tasks/)
  })

  it('keeps the live region, empty, once the digest is there', () => {
    expect(render('ready', true)).toBe('<div aria-live="polite" class="vol-live"></div>')
  })

  it('announces a failure at once with a way to try again, in plain words', () => {
    const html = render('unreachable')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Could not reach EMBER.')
    expect(html).toContain('Try again')
    expect(render('refused')).toContain('refused this request')
  })
})

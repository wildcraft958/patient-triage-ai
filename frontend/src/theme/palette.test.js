import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// vitest runs from the frontend root; jsdom does not give import.meta a file URL.
const read = (f) => readFileSync(resolve(process.cwd(), f), 'utf8')
const CSS = read('src/index.css')
const MKT = read('src/marketing.css')

/** The declarations inside the block whose opening brace `pattern` ends at. */
function block(pattern, css = CSS) {
  const i = css.search(pattern)
  let j = css.indexOf('{', i) + 1
  for (let depth = 1; depth; j++) {
    if (css[j] === '{') depth++
    else if (css[j] === '}') depth--
  }
  return [...css.slice(css.indexOf('{', i) + 1, j - 1)
    .matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
}

const DARK = /:root\[data-theme="dark"\]/
const DARK_MEDIA = /:root:not\(\[data-theme="light"\]\)/

// The dark palette is declared twice: once for the explicit choice, once for
// the system preference. Nothing enforces that they agree, and they had
// already drifted to three stray duplicate declarations. A token that moves in
// one block and not the other renders one theme's text on the other's ground.
describe('the two dark palette blocks', () => {
  it('declare each token exactly once', () => {
    for (const [name, pattern] of [['explicit', DARK], ['media', DARK_MEDIA]]) {
      const decls = block(pattern).map(([k]) => k)
      const dupes = decls.filter((k, i) => decls.indexOf(k) !== i)
      expect(dupes, `duplicate declarations in the ${name} block`).toEqual([])
    }
  })

  it('agree on every token and value', () => {
    expect(Object.fromEntries(block(DARK_MEDIA)))
      .toEqual(Object.fromEntries(block(DARK)))
  })

  // A token the dark block moves but the light block never declared has no
  // light value to fall back to, so the console renders it as nothing at all.
  it('move only tokens the light theme declares', () => {
    const light = new Set(block(/@theme/).map(([k]) => k))
    const orphans = block(DARK).map(([k]) => k).filter((k) => !light.has(k))
    expect(orphans).toEqual([])
  })
})

// The product site used to carry its own private copy of the dark palette,
// and it drifted: the console was lifted a shade and the site was not, so the
// two halves of the same product stopped matching. There is one palette now,
// and this is what keeps it that way.
describe('the product site stylesheet', () => {
  it('declares no colour of its own', () => {
    const literals = [...MKT.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/g)].map((m) => m[0])
    expect(literals, 'every colour on the site must come from a console token')
      .toEqual([])
  })

  it('carries no theme block of its own', () => {
    expect(MKT).not.toMatch(/data-theme|prefers-color-scheme/)
  })
})

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

const PAIRS = [
  ...['app', 'card', 'raised', 'field'].flatMap((bg) =>
    ['ink', 'ink-2', 'ink-3'].map((fg) => [fg, bg])),
  ...[1, 2, 3, 4, 5].map((n) => [`esi-${n}-ink`, `esi-${n}`]),
  ...['alert', 'warn', 'ok', 'info'].map((t) => [`${t}-ink`, `${t}-bg`]),
  ['brand-ink', 'brand-tint'], ['brand-fg', 'brand'], ['brand-ink', 'card'],
  ['rail-ink', 'rail'], ['rail-ink-2', 'rail'], ['rail-ink', 'rail-2'],
  ['rail-ink-2', 'rail-2'],
  // The wordmark's ".ai", the sign-in eyebrow and the statistics band all put
  // brand-coloured text on the rail. The brand itself is a fill colour and
  // reads at 3.5:1 there, so the rail gets its own lighter brand ink.
  ['brand-rail', 'rail'], ['brand-rail', 'rail-2'],
]

// The two themes do not need the same separation to read. An edge on white
// is visible at a ratio that would disappear on a near-black ground, so the
// floors are per theme rather than one bar that lets dark regress to where it
// was when borders stopped showing at all.
describe.each([
  ['light', () => Object.fromEntries(block(/@theme/)),
   { card_app: 1.05, line_card: 1.25, line2_card: 1.55, field_card: 1.05,
     rail_app: 4 }],
  ['dark', () => ({ ...Object.fromEntries(block(/@theme/)),
                    ...Object.fromEntries(block(DARK)) }),
   { card_app: 1.08, line_card: 1.3, line2_card: 1.8, field_card: 1.05,
     rail_app: 1.04 }],
])('%s theme contrast', (_theme, tokens, floor) => {
  it('clears 4.5:1 on every pair the console paints', () => {
    const t = tokens()
    const failures = []
    for (const [fg, bg] of PAIRS) {
      const f = t[`--color-${fg}`]
      const b = t[`--color-${bg}`]
      if (!f || !b) continue
      const r = ratio(f, b)
      if (r < 4.5) failures.push(`${fg} on ${bg} = ${r.toFixed(2)}`)
    }
    expect(failures).toEqual([])
  })

  // Cards, rules and fields all sit within a few points of the ground in a
  // dark theme, and the palette had drifted far enough that borders stopped
  // reading at all. These are the separations that make structure visible.
  it('keeps surfaces and rules distinguishable', () => {
    const t = tokens()
    const at_least = (fg, bg, min) => {
      const r = ratio(t[`--color-${fg}`], t[`--color-${bg}`])
      return r >= min ? null : `${fg}/${bg} = ${r.toFixed(2)}, wanted ${min}`
    }
    expect([
      at_least('card', 'app', floor.card_app),
      at_least('line', 'card', floor.line_card),
      at_least('line-2', 'card', floor.line2_card),
      at_least('field', 'card', floor.field_card),
      // The navigation rail is the darkest surface in the ladder. In dark it
      // had come to within 1.02 of the board and stopped reading as a rail.
      at_least('rail', 'app', floor.rail_app),
    ].filter(Boolean)).toEqual([])
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// vitest runs from the frontend root; jsdom does not give import.meta a file URL.
const CSS = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

/** The declarations inside the block whose opening brace `pattern` ends at. */
function block(pattern) {
  const i = CSS.search(pattern)
  let j = CSS.indexOf('{', i) + 1
  for (let depth = 1; depth; j++) {
    if (CSS[j] === '{') depth++
    else if (CSS[j] === '}') depth--
  }
  return [...CSS.slice(CSS.indexOf('{', i) + 1, j - 1)
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
  ...['app', 'card', 'raised'].flatMap((bg) => ['ink', 'ink-2', 'ink-3'].map((fg) => [fg, bg])),
  ...[1, 2, 3, 4, 5].map((n) => [`esi-${n}-ink`, `esi-${n}`]),
  ...['alert', 'warn', 'ok', 'info'].map((t) => [`${t}-ink`, `${t}-bg`]),
  ['brand-ink', 'brand-tint'], ['brand-fg', 'brand'], ['brand-ink', 'card'],
  ['rail-ink', 'rail'], ['rail-ink-2', 'rail'], ['rail-ink', 'rail-2'],
  ['rail-ink-2', 'rail-2'],
]

// ink-3 is de-emphasised micro-copy on the least used surface. It sits just
// under the body-text bar in both themes and is listed rather than rounded
// away, so moving the palette cannot quietly add a second exception.
const KNOWN_BELOW = new Set(['ink-3 on raised'])

describe.each([
  ['light', () => Object.fromEntries(block(/@theme/))],
  ['dark', () => ({ ...Object.fromEntries(block(/@theme/)),
                    ...Object.fromEntries(block(DARK)) })],
])('%s theme contrast', (_theme, tokens) => {
  it('clears 4.5:1 on every pair the console paints', () => {
    const t = tokens()
    const failures = []
    for (const [fg, bg] of PAIRS) {
      const f = t[`--color-${fg}`]
      const b = t[`--color-${bg}`]
      if (!f || !b) continue
      const r = ratio(f, b)
      const label = `${fg} on ${bg}`
      if (r < (KNOWN_BELOW.has(label) ? 4.2 : 4.5)) {
        failures.push(`${label} = ${r.toFixed(2)}`)
      }
    }
    expect(failures).toEqual([])
  })
})

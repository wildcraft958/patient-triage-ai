import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BeliefPeak, Input, Scrim, Select, Textarea } from './ui'

// The waiting-room monitor keeps a belief over the true acuity. Where that
// belief peaks is usually the level already on the badge beside it, and
// occasionally it is not. That disagreement is the whole point of publishing
// the number, and it used to be written as P(ESI-3), which is notation a
// nurse mid-shift will not stop to decode.

describe('the acuity belief figure', () => {
  it('names the level only when the belief disagrees with the badge', () => {
    render(<BeliefPeak peak={{ esi: 3, p: 0.52 }} assigned={2} />)
    expect(screen.getByText(/52%/)).toBeInTheDocument()
    expect(screen.getByText(/most likely ESI-3/i)).toBeInTheDocument()
  })

  it('stays quiet when the belief agrees with the badge', () => {
    render(<BeliefPeak peak={{ esi: 2, p: 0.71 }} assigned={2} />)
    expect(screen.getByText(/71%/)).toBeInTheDocument()
    expect(screen.queryByText(/most likely/i)).not.toBeInTheDocument()
  })

  it('writes no probability notation on either path', () => {
    const { container, rerender } = render(<BeliefPeak peak={{ esi: 3, p: 0.52 }} assigned={2} />)
    expect(container.textContent).not.toMatch(/P\(/)
    rerender(<BeliefPeak peak={{ esi: 2, p: 0.71 }} assigned={2} />)
    expect(container.textContent).not.toMatch(/P\(/)
  })
})

// Tailwind's Preflight is deliberately not imported and @layer base sets only
// `font: inherit; color: inherit` on form controls, so a field with no
// background of its own is painted by the browser. Nineteen of them were, and
// in dark mode they came out as Chrome's grey in the middle of a violet
// console. This is the check that a field cannot go back to being unpainted.

describe('form controls', () => {
  it.each([
    ['input', <Input key="i" defaultValue="" />],
    ['select', <Select key="s"><option>one</option></Select>],
    ['textarea', <Textarea key="t" defaultValue="" />],
  ])('paint their own %s background and ink', (_kind, element) => {
    const { container } = render(element)
    const el = container.firstElementChild
    expect(el.className).toMatch(/\bbg-field\b/)
    expect(el.className).toMatch(/\btext-ink\b/)
    expect(el.className).toMatch(/\bborder-field-line\b/)
  })

  it('dims the board with the scrim, never with the body ink', () => {
    // --color-ink is near white in dark, so bg-ink/45 washed the console out
    // instead of dimming it. Five dialogs did exactly that.
    const { container } = render(<Scrim onClick={() => {}} />)
    expect(container.firstElementChild.className).toMatch(/\bbg-scrim\//)
    expect(container.firstElementChild.className).not.toMatch(/\bbg-ink\b|\bbg-ink\//)
  })

  // Two bg-scrim classes on one element is a fight decided by stylesheet
  // order rather than by what the caller meant, and it put the whole board
  // under a heavy wash behind the patient record.
  it.each(['full', 'panel'])('sets exactly one %s strength', (tone) => {
    const { container } = render(<Scrim tone={tone} className="z-40" />)
    const found = container.firstElementChild.className.match(/bg-scrim\/\d+/g)
    expect(found).toHaveLength(1)
  })
})

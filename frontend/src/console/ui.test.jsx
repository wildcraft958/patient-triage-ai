import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BeliefPeak } from './ui'

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

import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HeroQueue from './HeroQueue'

// The hero animates. Someone who has asked their operating system to stop
// animations still has to be told what the page is claiming, so the reduced
// path is not "no animation, first frame": it is the result, held still.

const prefers = (reduce) => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reduce })))
}

afterEach(() => vi.unstubAllGlobals())

/** The rows in the order they are painted down the board. */
const order = () => [...document.querySelectorAll('.room-row')]
  .sort((a, b) => parseFloat(a.style.transform.match(/-?[\d.]+/)[0])
                - parseFloat(b.style.transform.match(/-?[\d.]+/)[0]))
  .map((r) => r.querySelector('.room-who b').textContent.trim().split(' ').slice(0, 2).join(' '))

describe('the waiting room in the hero', () => {
  it('holds the settled result when motion is not wanted', () => {
    prefers(true)
    render(<HeroQueue />)
    expect(order()[0]).toBe('R. Osei')
    expect(screen.getByText(/outranks three sicker patients/i)).toBeInTheDocument()
  })

  it('starts from the board as it stood before anyone deteriorated', () => {
    prefers(false)
    render(<HeroQueue />)
    expect(order()[0]).toBe('N. Haddad')
    expect(order()[3]).toBe('R. Osei')
  })

  // An ESI-3 sitting above three ESI-2s is the claim, and it only reads as a
  // claim rather than a bug if the board says why.
  it('says why the less acute patient came first', () => {
    prefers(true)
    render(<HeroQueue />)
    const first = order()[0]
    expect(first).toBe('R. Osei')
    expect(screen.getByText(/ESI-3/)).toBeInTheDocument()
    expect(screen.getByText(/vitals turned/i)).toBeInTheDocument()
  })
})

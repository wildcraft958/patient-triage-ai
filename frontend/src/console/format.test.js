import { describe, expect, it } from 'vitest'
import {
  ESI_BG, ESI_INK, ESI_LABEL, EVENT_COMPONENT, HUMAN_CODES, fmtAge, shiftClock,
} from './format'

// Tailwind extracts class names statically, so the acuity scale is a literal
// map rather than an interpolation. A missing level is an unstyled badge on
// the one screen where the colour carries the clinical meaning.
describe('the acuity scale', () => {
  const LEVELS = [1, 2, 3, 4, 5]

  it('covers all five levels in every lookup', () => {
    for (const map of [ESI_BG, ESI_INK, ESI_LABEL]) {
      expect(Object.keys(map).map(Number).sort()).toEqual(LEVELS)
    }
  })

  it('names a distinct ink class per level', () => {
    // One ink token cannot serve all five fills: white clears 4.5:1 on the two
    // deep fills and misses it on the lighter three, so the ink flips at 3.
    expect(new Set(Object.values(ESI_INK)).size).toBe(5)
    expect(Object.values(ESI_INK).every((c) => c.startsWith('text-esi-'))).toBe(true)
  })
})

describe('ages', () => {
  it('reads a neonate in days and an infant in months', () => {
    expect(fmtAge(0, 0.5)).toBe('15d')
    expect(fmtAge(0, 7)).toBe('7mo')
    expect(fmtAge(61)).toBe('61y')
  })
})

describe('the shift clock', () => {
  it('starts at 07:00 and rolls past noon and midnight', () => {
    expect(shiftClock(0)).toBe('7:00 AM')
    expect(shiftClock(5 * 60)).toBe('12:00 PM')
    expect(shiftClock(17 * 60)).toBe('12:00 AM')
  })
})

describe('activity log labelling', () => {
  it('gives every audited event a component code', () => {
    for (const [kind, entry] of Object.entries(EVENT_COMPONENT)) {
      const [code, render] = entry
      expect(code, kind).toMatch(/^[A-Z]{2,4}$/)
      expect(typeof render, kind).toBe('function')
    }
  })

  it('keeps clinicians out of the component codes', () => {
    // A person is not an agent, and the log must never let the two look alike.
    expect(HUMAN_CODES.has('RN')).toBe(true)
    expect(EVENT_COMPONENT.override[0]).toBe('RN')
    expect(EVENT_COMPONENT.triage[0]).toBe('FUS')
  })
})

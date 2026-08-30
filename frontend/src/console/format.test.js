import { describe, expect, it } from 'vitest'
import {
  ESI_BG, ESI_INK, ESI_LABEL, EVENT_COMPONENT, HUMAN_CODES, alertLabel,
  categoryLabel, fmtAge, outcomeLabel, shiftClock,
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

describe('backend identifiers on their way to a clinician', () => {
  it('names every alert kind the monitor can raise', () => {
    expect(alertLabel('WAIT_BREACH')).toBe('Safe wait exceeded')
    expect(alertLabel('DETERIORATION')).toBe('Deterioration detected')
  })

  it('names every deferred-reasoning outcome the service records', () => {
    expect(outcomeLabel('llm_unavailable')).toBe('the reasoning path did not answer')
    expect(outcomeLabel('clinician_decision_stands'))
      .toBe('a clinician had already decided')
  })

  it('reads a complaint category the way it is spoken', () => {
    expect(categoryLabel('chest_pain')).toBe('Chest pain')
    expect(categoryLabel('trauma_major')).toBe('Major trauma')
    expect(categoryLabel('pregnancy_complication')).toBe('Pregnancy complication')
  })

  it('never leaks an underscore for a value it has no label for', () => {
    // The maps cover today's values. A backend that adds one must not put a
    // raw identifier on the board, so the fallback humanises rather than
    // passing the token through.
    for (const label of [alertLabel('NEW_KIND'), outcomeLabel('some_new_outcome'),
                         categoryLabel('novel_category')]) {
      expect(label).not.toMatch(/_/)
    }
    expect(alertLabel('NEW_KIND')).toBe('New kind')
  })
})

describe('every activity-log line, not just the helpers', () => {
  // The shared maps went in and two describers in this same file were left
  // interpolating the enum directly. Testing alertLabel in isolation could not
  // see that, so this runs the describers themselves.
  const PAYLOAD = {
    esi: 2, confidence: 'high', paths_agree: true, kind: 'WAIT_BREACH',
    reasons: ['waited 35 min'], previous_esi: 3, new_esi: 2,
    trigger: 'DETERIORATION', outcome: 'llm_unavailable', clinician_id: 'RN-07',
    reason: 'reassessed', waited_min: 12, reward: 1, under_triage: false,
  }

  it('puts no backend identifier in front of a clinician', () => {
    const offenders = []
    for (const [type, [, describe]] of Object.entries(EVENT_COMPONENT)) {
      const line = describe(PAYLOAD)
      if (/[a-z]_[a-z]|[A-Z]{2,}_[A-Z]{2,}/.test(line)) offenders.push(`${type}: ${line}`)
    }
    expect(offenders).toEqual([])
  })
})

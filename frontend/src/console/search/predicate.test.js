import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { describePredicate, select } from './predicate'

const ROWS = [
  { patient_id: 'SIM-001', display_name: 'M. Chen', esi: 2, age_years: 61,
    waited_min: 12, in_ed_min: 40, status: 'waiting', category: 'chest_pain',
    confidence: 'low', paths_agree: false, clinician_flag: true,
    vitals_worsening: [], alert_acknowledged: false, decided_by: null,
    action: 'REASSESS NOW', chief_complaint: 'Chest pain radiating to left arm' },
  { patient_id: 'SIM-003', display_name: 'N. Haddad', esi: 2, age_years: 0,
    age_months: 0.75, waited_min: 84, in_ed_min: 84, status: 'reassess_due',
    category: 'fever', confidence: 'moderate', paths_agree: true,
    clinician_flag: false, vitals_worsening: ['HR'], alert_acknowledged: false,
    decided_by: null, action: 'Monitor', chief_complaint: '3-week-old with fever' },
  { patient_id: 'SIM-013', display_name: 'C. Duval', esi: 4, age_years: 34,
    waited_min: 5, in_ed_min: 9, status: 'waiting', category: 'rash',
    confidence: 'high', paths_agree: true, clinician_flag: false,
    vitals_worsening: [], alert_acknowledged: true, decided_by: 'RN-07',
    action: 'Monitor', chief_complaint: 'Itchy raised rash on both arms' },
]

const ids = (parsed) => select(ROWS, parsed).map((r) => r.patient_id)
const q = (predicates, text = '') => ({ predicates, unmatched: [], text })

describe('applying predicates', () => {
  it('compares numbers', () => {
    expect(ids(q([{ field: 'waited_min', op: 'gt', value: 30 }]))).toEqual(['SIM-003'])
    expect(ids(q([{ field: 'waited_min', op: 'lt', value: 10 }]))).toEqual(['SIM-013'])
    expect(ids(q([{ field: 'esi', op: 'eq', value: 4 }]))).toEqual(['SIM-013'])
    expect(ids(q([{ field: 'esi', op: 'lte', value: 2 }]))).toEqual(['SIM-001', 'SIM-003'])
  })

  it('matches an enum, and a set of them', () => {
    expect(ids(q([{ field: 'category', op: 'eq', value: 'rash' }]))).toEqual(['SIM-013'])
    expect(ids(q([{ field: 'status', op: 'in',
                    value: ['reassess_due', 'deteriorating'] }]))).toEqual(['SIM-003'])
    expect(ids(q([{ field: 'confidence', op: 'eq', value: 'low' }]))).toEqual(['SIM-001'])
  })

  it('matches booleans without tripping over false', () => {
    expect(ids(q([{ field: 'paths_agree', op: 'is', value: false }]))).toEqual(['SIM-001'])
    expect(ids(q([{ field: 'clinician_flag', op: 'is', value: true }]))).toEqual(['SIM-001'])
    expect(ids(q([{ field: 'alert_acknowledged', op: 'is', value: false }])))
      .toEqual(['SIM-001', 'SIM-003'])
  })

  it('treats an empty list as not worsening', () => {
    expect(ids(q([{ field: 'vitals_worsening', op: 'nonempty' }]))).toEqual(['SIM-003'])
  })

  it('finds the undecided', () => {
    expect(ids(q([{ field: 'decided_by', op: 'isnull' }]))).toEqual(['SIM-001', 'SIM-003'])
  })

  it('narrows, never widens, when predicates are combined', () => {
    expect(ids(q([{ field: 'esi', op: 'eq', value: 2 },
                  { field: 'waited_min', op: 'gt', value: 30 }]))).toEqual(['SIM-003'])
  })

  it('searches free text over name and complaint together', () => {
    expect(ids(q([], 'duval'))).toEqual(['SIM-013'])
    expect(ids(q([], 'radiating'))).toEqual(['SIM-001'])
  })

  it('applies text and predicates at the same time', () => {
    expect(ids(q([{ field: 'esi', op: 'eq', value: 2 }], 'fever'))).toEqual(['SIM-003'])
  })

  it('returns the whole board when nothing was asked', () => {
    expect(ids(q([]))).toHaveLength(3)
  })

  // A baby is 0 age_years. Comparing "under 1 year" must not skip a row whose
  // age is a falsy zero, which is exactly the patient it most needs to find.
  it('does not lose a patient whose age is zero', () => {
    expect(ids(q([{ field: 'age_years', op: 'lt', value: 1 }]))).toEqual(['SIM-003'])
    expect(ids(q([{ field: 'age_years', op: 'lt', value: 18 }]))).toEqual(['SIM-003'])
  })

  // A row missing the field cannot satisfy a claim about it. Treating an
  // absent value as passing would put patients in a cohort by accident.
  it('excludes a row that has no value for the field', () => {
    expect(select([{ patient_id: 'X' }],
                  q([{ field: 'waited_min', op: 'gt', value: 1 }]))).toEqual([])
  })

  // A patient whose path agreement was never recorded is not a patient whose
  // paths disagreed. Coercing null to false would report a disagreement
  // between two engines when only one of them ever ran.
  it('does not call an unrecorded value a disagreement', () => {
    const unknown = [{ patient_id: 'X', paths_agree: null }]
    expect(select(unknown, q([{ field: 'paths_agree', op: 'is', value: false }])))
      .toEqual([])
    expect(select(unknown, q([{ field: 'paths_agree', op: 'is', value: true }])))
      .toEqual([])
  })
})

describe('describing a predicate for the chip', () => {
  it('says what it filtered, in words', () => {
    expect(describePredicate({ field: 'waited_min', op: 'gt', value: 30 }))
      .toBe('waiting over 30 min')
    expect(describePredicate({ field: 'esi', op: 'eq', value: 2 })).toBe('ESI 2')
    expect(describePredicate({ field: 'age_years', op: 'lt', value: 18 }))
      .toBe('age under 18')
    expect(describePredicate({ field: 'category', op: 'eq', value: 'chest_pain' }))
      .toBe('chest pain')
    expect(describePredicate({ field: 'paths_agree', op: 'is', value: false }))
      .toBe('paths disagreed')
    expect(describePredicate({ field: 'status', op: 'in',
                               value: ['reassess_due', 'deteriorating'] })).toBe('overdue')
    expect(describePredicate({ field: 'vitals_worsening', op: 'nonempty' }))
      .toBe('vitals worsening')
  })

  // A comparison with no word renders as the value alone, which reads as
  // equality: the chip would say the opposite of what it filters on.
  it('gives every comparison an operator word', () => {
    for (const op of ['gt', 'lt', 'gte', 'lte', 'ne']) {
      const shown = describePredicate({ field: 'esi', op, value: 2 })
      expect(shown, op).not.toBe('ESI 2')
    }
    expect(describePredicate({ field: 'esi', op: 'eq', value: 2 })).toBe('ESI 2')
  })

  // The chip is the thing the user checks the parse against, so it can never
  // fall back to something they cannot read.
  it('never renders a raw field name', () => {
    const shown = describePredicate({ field: 'decided_by', op: 'isnull' })
    expect(shown).not.toMatch(/_/)
    expect(shown.length).toBeGreaterThan(0)
  })
})

// One contract, two evaluators. The console filters the board it is showing;
// the backend re-evaluates pinned cohorts on the clock sweep. A standing
// cohort that means one thing on screen and another in the alert is worse
// than no standing cohort, so both sides are pinned to the same file.
describe('the shared predicate contract', () => {
  const contract = JSON.parse(
    readFileSync(resolve(process.cwd(), '../data/predicate_conformance.json'), 'utf8'))

  it('covers every operator the evaluator implements', () => {
    const ops = new Set(contract.cases.map((c) => c.predicate.op))
    expect([...ops].sort()).toEqual(
      ['eq', 'gt', 'gte', 'in', 'is', 'isnull', 'lt', 'lte', 'ne', 'nonempty'])
  })

  it.each(contract.cases.map((c) => [c.why, c]))('%s', (_why, c) => {
    const kept = select([c.row], { predicates: [c.predicate], text: '' })
    expect(kept.length === 1).toBe(c.holds)
  })
})

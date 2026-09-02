import { describe, expect, it } from 'vitest'
import { parse } from './parse'

// The parser maps language onto a closed set of fields taken from the board
// row itself. It never generates a query: converting clinical language to
// structured queries with a model shows 15 to 55% hallucination on concept
// mapping, and a filter that quietly means something else than it says is
// worse on a triage board than no filter at all.

const preds = (q) => parse(q).predicates
const one = (q) => { const p = preds(q); expect(p).toHaveLength(1); return p[0] }

describe('numeric comparisons', () => {
  it('reads a wait threshold', () => {
    expect(one('waiting over 30 minutes'))
      .toEqual({ field: 'waited_min', op: 'gt', value: 30 })
  })

  it('accepts the other ways of saying the same comparison', () => {
    for (const q of ['waiting more than 30 min', 'waited longer than 30 minutes',
                     'unattended above 30 min']) {
      expect(one(q).op, q).toBe('gt')
      expect(one(q).value, q).toBe(30)
    }
  })

  it('reads the opposite direction', () => {
    expect(one('waiting under 10 minutes').op).toBe('lt')
    expect(one('waiting at least 10 minutes').op).toBe('gte')
    expect(one('waiting at most 10 minutes').op).toBe('lte')
    // "no more than" has to be tried before "more than", or it reads as the
    // opposite comparison, or as none at all.
    expect(one('waiting no more than 10 minutes').op).toBe('lte')
    expect(one('waiting no less than 10 minutes').op).toBe('gte')
  })

  it('treats a bare number as equality', () => {
    expect(one('esi 2')).toEqual({ field: 'esi', op: 'eq', value: 2 })
  })

  it('reads time in the department separately from time since a check', () => {
    expect(one('in the department over 90 minutes').field).toBe('in_ed_min')
  })

  // A named band and an explicit number can both claim the age field. The
  // number is what the user actually typed, so it wins.
  it('lets an explicit number beat a named age band', () => {
    expect(one('elderly aged over 70'))
      .toEqual({ field: 'age_years', op: 'gt', value: 70 })
    expect(parse('elderly aged over 70').text).toBe('')
  })

  it('reads an age either way round', () => {
    expect(one('aged over 70')).toEqual({ field: 'age_years', op: 'gt', value: 70 })
    expect(one('70 years old')).toEqual({ field: 'age_years', op: 'eq', value: 70 })
  })
})

describe('named cohorts', () => {
  it('maps age bands to the age field, not to a word match', () => {
    expect(one('pediatric')).toEqual({ field: 'age_years', op: 'lt', value: 18 })
    expect(one('paediatric')).toEqual({ field: 'age_years', op: 'lt', value: 18 })
    expect(one('elderly')).toEqual({ field: 'age_years', op: 'gte', value: 65 })
    expect(one('infants')).toEqual({ field: 'age_years', op: 'lt', value: 1 })
  })

  it('maps board states', () => {
    expect(one('overdue')).toEqual({ field: 'status', op: 'in',
                                     value: ['reassess_due', 'deteriorating'] })
    expect(one('deteriorating')).toEqual({ field: 'status', op: 'eq',
                                           value: 'deteriorating' })
  })

  it('maps the disagreement and review flags', () => {
    expect(one('paths disagreed')).toEqual({ field: 'paths_agree', op: 'is', value: false })
    expect(one('flagged for review')).toEqual({ field: 'clinician_flag', op: 'is', value: true })
    expect(one('vitals worsening')).toEqual({ field: 'vitals_worsening', op: 'nonempty' })
  })

  it('maps confidence, which is a level and not a number', () => {
    expect(one('low confidence')).toEqual({ field: 'confidence', op: 'eq', value: 'low' })
  })

  it('maps a complaint category to the category field', () => {
    expect(one('chest pain')).toEqual({ field: 'category', op: 'eq', value: 'chest_pain' })
    expect(one('stroke signs')).toEqual({ field: 'category', op: 'eq', value: 'stroke_signs' })
  })

  // "pain" must not win over "chest pain", or the cohort is wrong and looks
  // right. The tell is the leftover: a short phrase matching first consumes
  // half the term and leaves the rest to be searched as free text.
  it('prefers the longest phrase it knows', () => {
    expect(one('abdominal pain').value).toBe('abdominal_pain')
    expect(parse('flagged for review').text, 'left "review" behind').toBe('')
    expect(parse('paths disagreed').text, 'left "paths" behind').toBe('')
  })
})

describe('combining terms', () => {
  it('reads several filters from one line', () => {
    const p = preds('pediatric fever waiting over 20 minutes')
    expect(p).toEqual(expect.arrayContaining([
      { field: 'age_years', op: 'lt', value: 18 },
      { field: 'category', op: 'eq', value: 'fever' },
      { field: 'waited_min', op: 'gt', value: 20 },
    ]))
    expect(p).toHaveLength(3)
  })

  it('ignores the words that only join a sentence together', () => {
    expect(preds('show me all patients who are overdue')).toHaveLength(1)
    expect(parse('show me all patients who are overdue').text).toBe('')
  })
})

describe('free text', () => {
  it('keeps anything it does not recognise as a text search', () => {
    const r = parse('castillo')
    expect(r.text).toBe('castillo')
    expect(r.predicates).toEqual([])
    expect(r.unmatched).toEqual([])
  })

  it('searches text alongside a filter', () => {
    const r = parse('castillo overdue')
    expect(r.text).toBe('castillo')
    expect(r.predicates).toHaveLength(1)
  })
})

// The dangerous case. "waiting over" is plainly meant as a filter and cannot
// be resolved, so it must be reported. Returning the unfiltered board with no
// warning would answer a question the user never asked.
describe('a comparison it cannot resolve', () => {
  it('reports the term instead of silently dropping it', () => {
    const r = parse('waiting over')
    expect(r.unmatched.length).toBeGreaterThan(0)
    expect(r.predicates).toEqual([])
  })

  it('reports a comparator with no field or number', () => {
    expect(parse('more than').unmatched.length).toBeGreaterThan(0)
  })

  it('still applies the part it did understand', () => {
    const r = parse('overdue waiting over')
    expect(r.predicates).toEqual([{ field: 'status', op: 'in',
                                    value: ['reassess_due', 'deteriorating'] }])
    expect(r.unmatched.length).toBeGreaterThan(0)
  })

  it('does not treat ordinary words as unresolved filters', () => {
    expect(parse('castillo').unmatched).toEqual([])
    expect(parse('chest pain').unmatched).toEqual([])
  })
})

describe('an empty query', () => {
  it('asks for nothing', () => {
    for (const q of ['', '   ']) {
      expect(parse(q)).toEqual({ predicates: [], unmatched: [], text: '' })
    }
  })
})

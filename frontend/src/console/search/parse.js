// Language to predicates, over a closed vocabulary taken from the board row
// itself. Nothing here generates a query. Converting clinical language to
// structured queries with a model shows 15 to 55% hallucination on concept
// mapping, and on a triage board a filter that quietly means something other
// than it says is worse than no filter at all. So the vocabulary is fixed,
// the parse is reported back for the user to confirm, and a term that looks
// like a filter but cannot be resolved is named rather than dropped.

// Fields that take a comparison. `priority` is deliberately absent: it is an
// internal score, not something anyone thresholds by hand.
const NUMERIC = [
  ['waited_min', ['waiting', 'waited', 'unattended', 'since last check',
                  'since assessment']],
  ['in_ed_min', ['in the department', 'in department', 'in the ed', 'in ed']],
  ['esi', ['esi', 'acuity', 'level']],
  ['age_years', ['aged', 'age']],
]

const COMPARATOR = {
  'no less than': 'gte', 'at least': 'gte', '>=': 'gte',
  'no more than': 'lte', 'at most': 'lte', '<=': 'lte',
  'more than': 'gt', 'longer than': 'gt', 'greater than': 'gt',
  over: 'gt', above: 'gt', '>': 'gt',
  'less than': 'lt', 'shorter than': 'lt',
  under: 'lt', below: 'lt', '<': 'lt',
  exactly: 'eq', equals: 'eq', '=': 'eq',
}

// A phrase the whole product already uses, mapped to the field it means.
const PHRASES = [
  [['pediatric', 'paediatric', 'children', 'child', 'kids'],
   { field: 'age_years', op: 'lt', value: 18 }],
  [['geriatric', 'elderly', 'older adults', 'older adult'],
   { field: 'age_years', op: 'gte', value: 65 }],
  [['newborn', 'neonate', 'infants', 'infant', 'babies', 'baby'],
   { field: 'age_years', op: 'lt', value: 1 }],

  [['overdue'], { field: 'status', op: 'in', value: ['reassess_due', 'deteriorating'] }],
  [['deteriorating', 'getting worse'], { field: 'status', op: 'eq', value: 'deteriorating' }],
  [['in treatment', 'in care'], { field: 'status', op: 'eq', value: 'in_treatment' }],
  [['needs reassessment', 'reassess now'], { field: 'action', op: 'eq', value: 'REASSESS NOW' }],

  [['paths disagreed', 'paths disagree', 'disagreement', 'disagreed'],
   { field: 'paths_agree', op: 'is', value: false }],
  [['paths agreed', 'paths agree'], { field: 'paths_agree', op: 'is', value: true }],
  [['flagged for review', 'needs review', 'flagged'],
   { field: 'clinician_flag', op: 'is', value: true }],
  [['vitals worsening', 'worsening'], { field: 'vitals_worsening', op: 'nonempty' }],
  [['not acknowledged', 'unacknowledged'],
   { field: 'alert_acknowledged', op: 'is', value: false }],
  [['no decision', 'undecided'], { field: 'decided_by', op: 'isnull' }],

  [['low confidence'], { field: 'confidence', op: 'eq', value: 'low' }],
  [['moderate confidence'], { field: 'confidence', op: 'eq', value: 'moderate' }],
  [['high confidence'], { field: 'confidence', op: 'eq', value: 'high' }],
]

// The complaint categories the engine actually classifies into. `other` is
// left out on purpose: as a search word it would swallow ordinary sentences.
const CATEGORIES = ['abdominal_pain', 'breathing_difficulty', 'chest_pain', 'fever',
  'laceration', 'medication_refill', 'rash', 'sprain', 'stroke_signs', 'trauma_major']

// Words that only join a sentence together, plus the units a comparison is
// already carrying. Left in, every one of them would look like a text search.
const FILLER = new Set(['show', 'me', 'all', 'any', 'list', 'find', 'the', 'of', 'for',
  'patients', 'patient', 'who', 'whose', 'are', 'is', 'and', 'with', 'on', 'board',
  'in', 'a', 'an', 'still', 'minutes', 'minute', 'mins', 'min', 'years', 'year',
  'old', 'yo', 'hours', 'hour'])

const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Order does not matter inside a regex alternation here: every synonym is
// anchored by surrounding whitespace, so "age" cannot steal a match from
// "aged". The phrase table below is a plain substring scan with no such
// anchor, which is why that one has to be sorted.
const alt = (ws) => ws.map(esc).join('|')

const CMP_ALT = alt(Object.keys(COMPARATOR))
const PHRASE_TABLE = [
  ...PHRASES.flatMap(([words, pred]) => words.map((w) => [w, pred])),
  ...CATEGORIES.map((c) => [c.replace(/_/g, ' '), { field: 'category', op: 'eq', value: c }]),
].sort((a, b) => b[0].length - a[0].length)

const NUM_WORDS = NUMERIC.flatMap(([, syns]) => syns)

export function parse(query) {
  let rest = ` ${String(query ?? '').toLowerCase().replace(/[^a-z0-9<>=]+/g, ' ').trim()} `
  if (!rest.trim()) return { predicates: [], unmatched: [], text: '' }

  const predicates = []
  const unmatched = []
  const taken = new Set()
  const add = (pred) => {
    if (taken.has(pred.field)) return
    taken.add(pred.field)
    predicates.push(pred)
  }

  // Comparisons first: they consume a field word and a number together, so
  // "waiting over 30" cannot leave "waiting" behind to look unresolved.
  for (const [field, syns] of NUMERIC) {
    const re = new RegExp(`\\s(?:${alt(syns)})\\s+(?:for\\s+|of\\s+)?`
                          + `(?:(${CMP_ALT})\\s+)?(\\d+)\\s`)
    const m = rest.match(re)
    if (!m) continue
    add({ field, op: m[1] ? COMPARATOR[m[1]] : 'eq', value: Number(m[2]) })
    rest = rest.replace(m[0], ' ')
  }

  // "70 years old" says the same thing the other way round.
  const age = rest.match(/\s(\d+)\s+(?:years?\s+old|yo)\s/)
  if (age) {
    add({ field: 'age_years', op: 'eq', value: Number(age[1]) })
    rest = rest.replace(age[0], ' ')
  }

  for (const [phrase, pred] of PHRASE_TABLE) {
    if (!rest.includes(` ${phrase} `)) continue
    add(pred)
    rest = rest.replace(` ${phrase} `, ' ')
  }

  // What is left. A field word or a comparator still sitting here was meant
  // as a filter and could not be resolved, so it gets named. Anything else is
  // an ordinary text search.
  for (const phrase of [...NUM_WORDS, ...Object.keys(COMPARATOR)]
    .sort((a, b) => b.length - a.length)) {
    while (rest.includes(` ${phrase} `)) {
      unmatched.push(phrase)
      rest = rest.replace(` ${phrase} `, ' ')
    }
  }

  const text = rest.split(/\s+/).filter((w) => w && !FILLER.has(w)).join(' ')
  return { predicates, unmatched, text }
}

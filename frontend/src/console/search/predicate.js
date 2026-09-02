// Applying a parsed query to the board, and saying in words what was applied.
// The chip the user reads comes from the same predicate the filter runs on,
// so what the board shows and what the console claims it showed cannot drift.

const OPS = {
  gt: (v, want) => v > want,
  lt: (v, want) => v < want,
  gte: (v, want) => v >= want,
  lte: (v, want) => v <= want,
  eq: (v, want) => v === want,
  ne: (v, want) => v !== want,
  in: (v, want) => want.includes(v),
  is: (v, want) => v === want,
  nonempty: (v) => Array.isArray(v) && v.length > 0,
  isnull: (v) => v === null || v === undefined,
}

// A row with no value for the field cannot satisfy a claim about it. Absence
// passing would put patients in a cohort by accident, so it fails instead.
// `isnull` is the only exception, being the one claim that is about absence.
//
// null counts as absent, which is the case that matters: a patient whose path
// agreement was never recorded is not a patient whose paths disagreed. fuse()
// reports no agreement when there was no second path at all, and calling that
// a disagreement says two engines reached different levels when only one of
// them ran.
function holds(row, { field, op, value }) {
  const v = row[field]
  if ((v === undefined || v === null) && op !== 'isnull') return false
  return OPS[op](v, value)
}

const TEXT_FIELDS = ['display_name', 'patient_id', 'chief_complaint']
const hasText = (row, needle) => TEXT_FIELDS.some((f) =>
  typeof row[f] === 'string' && row[f].toLowerCase().includes(needle))

export function select(rows, { predicates = [], text = '' } = {}) {
  const needle = text.trim().toLowerCase()
  return (rows ?? []).filter((row) =>
    predicates.every((p) => holds(row, p))
    && (!needle || hasText(row, needle)))
}

const WORDS = { gt: 'over', lt: 'under', gte: 'at least', lte: 'at most', eq: '' }
const UNIT = { waited_min: ' min', in_ed_min: ' min' }
const NAMED = {
  waited_min: 'waiting', in_ed_min: 'in the department', esi: 'ESI', age_years: 'age',
}
const human = (v) => String(v).replace(/_/g, ' ')

/** What the chip says. Never a raw field name: this is what the user checks
 *  the parse against, so it has to read as the question they asked. */
export function describePredicate({ field, op, value }) {
  if (field === 'category') return human(value)
  if (field === 'confidence') return `${value} confidence`
  if (field === 'action') return 'due for reassessment'
  if (field === 'decided_by') return 'no decision recorded'
  if (field === 'vitals_worsening') return 'vitals worsening'
  if (field === 'paths_agree') return value ? 'paths agreed' : 'paths disagreed'
  if (field === 'clinician_flag') return value ? 'flagged for review' : 'not flagged'
  if (field === 'alert_acknowledged') return value ? 'acknowledged' : 'not acknowledged'
  if (field === 'status') {
    return op === 'in' ? 'overdue' : human(value)
  }
  const name = NAMED[field] ?? human(field)
  const cmp = WORDS[op]
  return `${name}${cmp ? ` ${cmp}` : ''} ${value}${UNIT[field] ?? ''}`.replace(/\s+/g, ' ')
}

// Formatting helpers and lookup tables shared across the console. Kept
// apart from the components so a fast-refresh reload never re-evaluates
// them, and so the acuity scale has one home.

// Tailwind resolves class names at build time, so an acuity scale cannot
// be interpolated. The map is the price of static extraction.
export const ESI_BG = {
  1: 'bg-esi-1', 2: 'bg-esi-2', 3: 'bg-esi-3', 4: 'bg-esi-4', 5: 'bg-esi-5',
}
// White text clears contrast on the two deep fills and fails on the lighter
// three, so the ink is per level rather than one token for the whole ramp.
export const ESI_INK = {
  1: 'text-esi-1-ink', 2: 'text-esi-2-ink', 3: 'text-esi-3-ink',
  4: 'text-esi-4-ink', 5: 'text-esi-5-ink',
}
export const ESI_LABEL = {
  1: 'Resuscitation', 2: 'Emergency', 3: 'Urgent', 4: 'Less urgent', 5: 'Non urgent',
}

export const fmt = (n) => (n == null ? '·' : Number(n).toFixed(0))

export const fmtAge = (years, months) => {
  if (months != null && years === 0) {
    if (months < 1) return `${Math.round(months * 30)}d`
    return `${Math.round(months)}mo`
  }
  return `${years}y`
}

// The shift starts at 07:00. sim_min is the clock everything else is
// derived from, so the board reads it as a time of day rather than
// inventing a second one.
const SHIFT_START_MIN = 7 * 60

export const shiftClock = (simMin) => {
  const total = SHIFT_START_MIN + Math.floor(simMin ?? 0)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

// The window each vital is drawn in. Presentation only: the clinical limit
// that decides whether a reading is dangerous rides on the patient record,
// published per age band by the same code the danger-zone gate reads.
export const VITAL_RANGE = {
  hr: [0, 200], rr: [0, 60], spo2: [85, 100],
  temp_c: [35, 41], sbp: [60, 240], pain: [0, 10],
}

export const VITAL_DEFS = [
  { key: 'hr', label: 'HR', unit: '', worseIfUp: true },
  { key: 'rr', label: 'RR', unit: '', worseIfUp: true },
  { key: 'spo2', label: 'SpO2', unit: '%', worseIfUp: false },
  { key: 'temp_c', label: 'Temp', unit: 'C', worseIfUp: true },
  { key: 'sbp', label: 'SBP', unit: '', worseIfUp: false },
  { key: 'pain', label: 'Pain', unit: '/10', worseIfUp: true },
]

// The profile name is configuration; this is how a department introduces
// itself on the status bar.
export const UNIT_LABEL = {
  urban_500: 'Urban trauma center · 500 visits/day',
  rural_100: 'Rural emergency department · 100 visits/day',
}

// The two shifts a console operator can open. Data, not a component.
export const SHIFTS = [
  {
    profile: 'urban_500', speedup: 1, tag: 'Urban trauma center · 500 visits a day',
    title: 'Normal shift',
    body: 'Twenty-four patients over about two hours, each scored by both '
        + 'engines. One of them deteriorates while waiting.',
  },
  {
    profile: 'rural_100', speedup: 3, tag: 'Rural emergency department · 100 visits a day',
    title: 'Surge stress test',
    body: 'The same arrivals at three times the rate. Past the threshold '
        + 'triage switches to the fast path and queues the reasoning pass.',
  },
]

// Backend enums on their way to a clinician. The service keys its own state
// in snake_case and SCREAMING_CASE, and none of that is language a nurse
// should be reading off a board. Every lookup falls back to a humanised form
// rather than the raw token, so a value the backend adds later degrades to
// readable English instead of leaking an identifier.
const humanise = (s) => {
  const words = String(s).toLowerCase().replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const ALERT_LABEL = {
  WAIT_BREACH: 'Safe wait exceeded',
  DETERIORATION: 'Deterioration detected',
}
export const alertLabel = (kind) => ALERT_LABEL[kind] ?? humanise(kind)

const OUTCOME_LABEL = {
  llm_unavailable: 'the reasoning path did not answer',
  clinician_decision_stands: 'a clinician had already decided',
}
export const outcomeLabel = (outcome) =>
  OUTCOME_LABEL[outcome] ?? humanise(outcome).toLowerCase()

// Only the categories whose words need reordering are listed; the rest read
// correctly once the underscore is gone.
const CATEGORY_LABEL = {
  trauma_major: 'Major trauma',
  other: 'Auto (from complaint text)',
}
export const categoryLabel = (c) => CATEGORY_LABEL[c] ?? humanise(c)

// Which component produced each kind of audit event. The codes themselves are
// published by GET /system/registry; this only says which one owns which
// event, so the activity log and the registry cannot drift apart.
export const EVENT_COMPONENT = {
  triage: ['FUS', (p) => `Triage complete, ESI-${p.esi} at ${p.confidence} confidence`
                        + (p.paths_agree ? ', paths agreed' : ', paths disagreed')],
  alert: ['MON', (p) => `${alertLabel(p.kind)}: ${(p.reasons || []).join('; ')}`],
  reassessment: ['MON', (p) => `Automatic re-triage, ESI-${p.previous_esi} to ESI-${p.new_esi}`
                        + ` (${alertLabel(p.trigger).toLowerCase()})`],
  surge_enrichment: ['LLM', (p) => (p.outcome
    ? `Deferred reasoning: ${outcomeLabel(p.outcome)}`
    : `Deferred reasoning attached, ESI-${p.previous_esi} to ESI-${p.new_esi}`)],
  override: ['RN', (p) => `${p.clinician_id} set ESI-${p.new_esi} over ESI-${p.original_esi}: "${p.reason}"`],
  override_safety_flag: ['SAF', (p) => `High-risk downgrade flagged and acknowledged by ${p.clinician_id}`],
  acceptance: ['RN', (p) => `${p.clinician_id} accepted ESI-${p.esi}`],
  reassessment_check: ['RN', (p) => `${p.clinician_id} reassessed at the bedside after ${p.waited_min} min`],
  alert_ack: ['RN', (p) => `${p.clinician_id} acknowledged: ${alertLabel(p.kind).toLowerCase()}`],
  reward: ['CAL', (p) => `Reward ${p.reward} recorded${p.under_triage ? ', under-triage signal' : ''}`],
}

// Codes that are not components: a clinician is a person, not an agent, and
// the log should never let the two look alike.
export const HUMAN_CODES = new Set(['RN'])

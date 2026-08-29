// Formatting helpers shared across the console. Kept apart from the
// components so a fast-refresh reload never has to re-evaluate them.

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

export const VITAL_DEFS = [
  { key: 'hr', label: 'HR', unit: '', worseIfUp: true },
  { key: 'rr', label: 'RR', unit: '', worseIfUp: true },
  { key: 'spo2', label: 'SpO2', unit: '%', worseIfUp: false },
  { key: 'temp_c', label: 'Temp', unit: 'C', worseIfUp: true },
  { key: 'sbp', label: 'SBP', unit: '', worseIfUp: false },
  { key: 'pain', label: 'Pain', unit: '/10', worseIfUp: true },
]

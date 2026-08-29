// Shared presentation pieces for the console. Kept in one place so the
// queue, the reassessment board and the triage card render a patient the
// same way wherever they show up.

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

// worsening_reasons only emits a line when a vital moved the dangerous way,
// so the arrow follows from which vital it is - no parsing of the numbers.
const WORSE_ARROW = { HR: '↑', RR: '↑', Temp: '↑', SBP: '↓', SpO2: '↓' }

export function EsiBadge({ esi, big }) {
  return <span className={`esi esi-${esi} ${big ? 'esi-big' : ''}`}>ESI-{esi}</span>
}

export function ConfMeter({ level }) {
  const filled = { high: 3, moderate: 2, low: 1 }[level] ?? 0
  return (
    <span className="conf-meter" title={`${level} confidence`}>
      {[0, 1, 2].map((i) => <i key={i} className={i < filled ? 'on' : ''} />)}
    </span>
  )
}

export function TrendArrows({ worsening }) {
  if (!worsening?.length) return <span className="trend-stable">Stable</span>
  return (
    <span className="trend-arrows">
      {worsening.map((reason) => {
        const label = reason.split(' ')[0]
        return (
          <span key={label} className="trend-arrow" title={reason}>
            {label}{WORSE_ARROW[label] ?? '!'}
          </span>
        )
      })}
    </span>
  )
}

// Acuity belief peak: P(true acuity is ESI-n). A real number the POMDP
// computes, not a confidence percentage invented for the column.
export function BeliefPeak({ peak, pathsAgree }) {
  if (!peak) return null
  return (
    <span className={`belief-peak ${pathsAgree ? '' : 'uncertain'}`}
          title={`Acuity belief: P(true acuity is ESI-${peak.esi}) = ${(peak.p * 100).toFixed(0)}%`}>
      P(ESI-{peak.esi}) {(peak.p * 100).toFixed(0)}%
      {!pathsAgree && <b className="uncertain-mark"> ⚠</b>}
    </span>
  )
}

export function Sparkline({ values, worseIfUp, width = 62, height = 18 }) {
  const points = values.filter((v) => v != null)
  if (points.length < 2) return <span className="spark-flat">no trend yet</span>
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const step = width / (points.length - 1)
  const path = points
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 3) - 1.5).toFixed(1)}`)
    .join(' ')
  const last = points[points.length - 1]
  const worse = worseIfUp ? last > points[0] : last < points[0]
  const lastY = height - ((last - min) / span) * (height - 3) - 1.5
  return (
    <svg className={`spark ${worse ? 'worse' : ''}`} width={width + 4} height={height}
         viewBox={`0 0 ${width + 4} ${height}`} aria-hidden="true">
      <polyline points={path} fill="none" strokeWidth="1.5" />
      <circle cx={width} cy={lastY} r="2" />
    </svg>
  )
}

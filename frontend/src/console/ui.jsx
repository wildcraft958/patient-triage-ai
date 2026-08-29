// Shared presentation pieces for the console. Kept in one place so the
// queue, the reassessment board and the triage card render a patient the
// same way wherever they show up.

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
  if (points.length < 2) return null  // the card already says it is a single reading
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

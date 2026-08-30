import { TrendingDown, TrendingUp } from 'lucide-react'
import { ESI_BG, ESI_INK, ESI_LABEL } from './format'

// Design-system primitives for the console. Every screen composes these, so
// a patient, an acuity level and an action look the same wherever they show
// up. Clinical surfaces stay neutral; colour is reserved for acuity, alerts
// and the product's own voice.

const BTN_BASE = 'inline-flex items-center justify-center gap-1.5 font-semibold ' +
  'rounded-sm border transition-colors disabled:opacity-45 ' +
  'disabled:cursor-default cursor-pointer whitespace-nowrap ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

const BTN_VARIANT = {
  primary: 'bg-brand text-brand-fg border-brand hover:bg-brand-ink hover:border-brand-ink',
  outline: 'bg-card text-ink border-line-2 hover:border-brand hover:text-brand-ink',
  danger: 'bg-esi-2 text-esi-2-ink border-esi-2 hover:bg-esi-1 hover:border-esi-1',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-app hover:text-ink',
  dark: 'bg-rail-2 text-rail-ink border-rail-3 hover:bg-rail-3',
}

const BTN_SIZE = {
  sm: 'text-[11px] px-2.5 py-1',
  md: 'text-xs px-3.5 py-1.5',
  lg: 'text-sm px-5 py-2.5',
}

export function Btn({ variant = 'outline', size = 'md', className = '',
                      children, ...rest }) {
  return (
    <button className={`${BTN_BASE} ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className}`}
            {...rest}>
      {children}
    </button>
  )
}

export function EsiBadge({ esi, size = 'md' }) {
  const dims = {
    sm: 'text-[10px] px-1.5 py-0.5 min-w-[38px]',
    md: 'text-[11px] px-2 py-1 min-w-[46px]',
    lg: 'text-sm px-3 py-1.5 min-w-[62px]',
  }[size]
  return (
    <span className={`${ESI_BG[esi]} ${ESI_INK[esi]} ${dims} inline-block rounded-sm
                      text-center font-bold tabular-nums tracking-tight`}
          title={`ESI-${esi} ${ESI_LABEL[esi]}`}>
      ESI-{esi}
    </span>
  )
}

// Initials in an acuity-coloured square, never an avatar circle: at a glance
// the square says how sick, and the letters say who.
export function Initials({ name, id, esi, size = 'md' }) {
  const source = name || id || '?'
  const letters = source.replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/)
    .map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  const dims = { sm: 'w-7 h-7 text-[10px]', md: 'w-9 h-9 text-xs' }[size]
  return (
    <span className={`${esi ? `${ESI_BG[esi]} ${ESI_INK[esi]}` : 'bg-ink-2 text-card'}
                      ${dims} shrink-0 rounded-sm inline-flex items-center
                      justify-center font-bold tracking-tight`}>
      {letters}
    </span>
  )
}

const PILL_TONE = {
  neutral: 'bg-app text-ink-2 border-line',
  brand: 'bg-brand-tint text-brand-ink border-brand-line',
  alert: 'bg-alert-bg text-alert-ink border-alert-line',
  warn: 'bg-warn-bg text-warn-ink border-warn-line',
  ok: 'bg-ok-bg text-ok-ink border-ok-line',
  info: 'bg-info-bg text-info-ink border-info-line',
  solid: 'bg-esi-2 text-esi-2-ink border-esi-2',
}

export function Pill({ tone = 'neutral', className = '', children, ...rest }) {
  return (
    <span className={`${PILL_TONE[tone]} inline-flex items-center gap-1 border
                      rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase
                      tracking-wide whitespace-nowrap ${className}`} {...rest}>
      {children}
    </span>
  )
}

export function Card({ className = '', children, ...rest }) {
  return (
    <section className={`bg-card border border-line rounded-md ${className}`} {...rest}>
      {children}
    </section>
  )
}

export function CardHead({ title, note, children }) {
  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3
                       border-b border-line">
      <div className="min-w-0">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-2">
          {title}
        </h2>
        {note && <p className="text-[11px] text-ink-3 mt-0.5 leading-snug">{note}</p>}
      </div>
      {children}
    </header>
  )
}

export function Empty({ children }) {
  return <p className="text-xs text-ink-3 italic px-4 py-6">{children}</p>
}

// worsening_reasons only emits a line when a vital moved the dangerous way,
// so the arrow follows from which vital it is, with no parsing of numbers.
const WORSE_ARROW = { HR: '↑', RR: '↑', Temp: '↑', SBP: '↓', SpO2: '↓' }

export function TrendArrows({ worsening }) {
  if (!worsening?.length) {
    return <span className="text-[11px] text-ink-3">Stable</span>
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {worsening.map((reason) => {
        const label = reason.split(' ')[0]
        return (
          <span key={label} title={reason}
                className="text-[10px] font-bold text-alert-ink bg-alert-bg
                           border border-alert-line rounded-sm px-1 py-px tabular-nums">
            {label}{WORSE_ARROW[label] ?? '!'}
          </span>
        )
      })}
    </span>
  )
}

// Acuity belief peak: P(true acuity is ESI-n). A number the POMDP computes,
// not a confidence percentage invented for the column.
//
// The warning marker keys off the fused confidence band and path agreement,
// never off the percentage. A belief spread over five levels peaks in the
// sixties for a perfectly ordinary patient, so a raw threshold would flag
// the whole board and the flag would stop meaning anything.
export function BeliefPeak({ peak, assigned, pathsAgree, confidence }) {
  if (!peak) return null
  const shaky = pathsAgree === false || confidence === 'low'
  const pct = (peak.p * 100).toFixed(0)
  // Naming the level is only news when the monitor's belief peaks somewhere
  // other than the level on the badge beside it. Writing P(ESI-n) on every row
  // spent the space on notation and buried the one case worth noticing.
  const diverges = assigned != null && peak.esi !== assigned
  return (
    <span title={`Acuity belief: P(true acuity is ESI-${peak.esi}) = ${pct}%`}
          className={`inline-flex items-center gap-1 text-[11px] tabular-nums
                      ${shaky ? 'text-warn-ink font-bold' : 'text-ink-2'}`}>
      <b className="text-xs">{pct}%</b>
      <span className="text-[10px] text-ink-3">
        {diverges ? `most likely ESI-${peak.esi}` : 'confident'}
      </span>
      {shaky && <span aria-hidden="true">⚠</span>}
    </span>
  )
}

// A reading against the limit it was actually scored against, rather than a
// line joining two numbers. It draws with a single reading, which is what most
// patients have at triage, and the old sparkline could not: it returned
// nothing below two points and left the panel looking broken.
export function VitalGauge({ value, range, limit }) {
  const [lo, hi] = range
  const pct = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))
  // A low limit means the danger is below it (SpO2, SBP); a high limit means
  // above. SBP has both, and the reading only has to breach one.
  const breached = (limit?.low != null && value < limit.low)
                || (limit?.high != null && value > limit.high)
  const marks = [limit?.low, limit?.high].filter((m) => m != null && m > lo && m < hi)

  return (
    <div className="relative h-1.5 rounded-full bg-app mt-2"
         role="img"
         aria-label={`${value} against a safe range of ${limit?.low ?? lo} to ${limit?.high ?? hi}`}>
      <span className={`absolute inset-y-0 left-0 rounded-full
                        ${breached ? 'bg-esi-2' : 'bg-brand'}`}
            style={{ width: `${pct(value)}%` }} />
      {marks.map((m) => (
        // The tick has to read on the filled bar and on the empty track
        // either side of it, so it takes the body ink rather than a hairline.
        <span key={m} className="absolute -inset-y-0.5 w-0.5 rounded-full bg-ink"
              style={{ left: `${pct(m)}%` }} aria-hidden="true" />
      ))}
    </div>
  )
}

// Direction of travel since triage, as a glyph rather than a two-point line.
// Only shown once there is a second reading to compare against.
export function VitalTrend({ from, to, worseIfUp }) {
  if (from == null || to == null || Math.abs(to - from) < 0.1) return null
  const up = to > from
  const worse = worseIfUp ? up : !up
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <Icon size={13} aria-label={up ? 'rising since triage' : 'falling since triage'}
          className={worse ? 'text-esi-2' : 'text-ok-ink'} />
  )
}


// A bar that fills toward a limit. Used for wait pressure against the safe
// wait for a level, and for reassessment priority.
export function Meter({ value, tone = 'brand', className = '' }) {
  const fill = {
    brand: 'bg-brand', alert: 'bg-esi-2', warn: 'bg-esi-4', ok: 'bg-esi-5',
  }[tone]
  return (
    <span className={`block h-1 rounded-full bg-line overflow-hidden ${className}`}>
      <i className={`block h-full rounded-full ${fill}`}
         style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </span>
  )
}

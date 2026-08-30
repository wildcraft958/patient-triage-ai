import { ESI_BG, ESI_LABEL } from './format'

// Design-system primitives for the console. Every screen composes these, so
// a patient, an acuity level and an action look the same wherever they show
// up. Clinical surfaces stay neutral; colour is reserved for acuity, alerts
// and the product's own voice.

const BTN_BASE = 'inline-flex items-center justify-center gap-1.5 font-semibold ' +
  'rounded-sm border transition-colors disabled:opacity-45 ' +
  'disabled:cursor-default cursor-pointer whitespace-nowrap ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

const BTN_VARIANT = {
  primary: 'bg-brand text-white border-brand hover:bg-brand-ink hover:border-brand-ink',
  outline: 'bg-card text-ink border-line-2 hover:border-brand hover:text-brand-ink',
  danger: 'bg-esi-2 text-white border-esi-2 hover:bg-esi-1 hover:border-esi-1',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-app hover:text-ink',
  dark: 'bg-rail-2 text-white border-rail-3 hover:bg-rail-3',
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
    <span className={`${ESI_BG[esi]} ${dims} inline-block text-center rounded-sm
                      text-white font-bold tabular-nums tracking-tight`}
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
    <span className={`${esi ? ESI_BG[esi] : 'bg-ink-2'} ${dims} shrink-0 rounded-sm
                      inline-flex items-center justify-center font-bold text-white
                      tracking-tight`}>
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
  solid: 'bg-esi-2 text-white border-esi-2',
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
export function BeliefPeak({ peak, pathsAgree, confidence }) {
  if (!peak) return null
  const shaky = pathsAgree === false || confidence === 'low'
  return (
    <span title={`Acuity belief: P(true acuity is ESI-${peak.esi}) = ${(peak.p * 100).toFixed(0)}%`}
          className={`inline-flex items-center gap-1 text-[11px] tabular-nums
                      ${shaky ? 'text-warn-ink font-bold' : 'text-ink-2'}`}>
      <b className="text-xs">{(peak.p * 100).toFixed(0)}%</b>
      <span className="text-[10px] text-ink-3">P(ESI-{peak.esi})</span>
      {shaky && <span aria-hidden="true">⚠</span>}
    </span>
  )
}

export function Sparkline({ values, worseIfUp, width = 62, height = 18 }) {
  const points = values.filter((v) => v != null)
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const step = width / (points.length - 1)
  const y = (v) => height - ((v - min) / span) * (height - 3) - 1.5
  const path = points.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  const worse = worseIfUp ? last > points[0] : last < points[0]
  const stroke = worse ? 'var(--color-esi-2)' : 'var(--color-brand)'
  return (
    <svg width={width + 4} height={height} viewBox={`0 0 ${width + 4} ${height}`}
         aria-hidden="true" className="overflow-visible">
      <polyline points={path} fill="none" stroke={stroke} strokeWidth="1.5"
                strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={y(last)} r="2" fill={stroke} />
    </svg>
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

import { Lock, Send } from 'lucide-react'

// The flow chart engine. Both the console's pipeline trace and the product
// site's "how it works" section draw from here, so there is one graph in the
// product rather than two that drift.
//
// Every part takes a `delay` and nothing schedules itself: the caller reads
// one timetable from flowClock.js, which is what keeps the darts and the node
// glows on the same clock.

const TONE = {
  neutral: 'border-line', brand: 'border-brand-line',
  ok: 'border-ok-line', warn: 'border-warn-line',
}

/**
 * The runs between stacked stages, drawn as one stretched SVG so the geometry
 * survives any column width: the fork after redaction, the join before
 * fusion, and a straight drop where one stage simply feeds the next. The
 * graph is a single column, so this is the only connector there is.
 */
export function Branch({ join = false, straight = false, dart, delay = 0 }) {
  // The paths sit in a two-column grid, so the branch drops have to land on
  // 25% and 75% to meet the middle of each node rather than near it.
  if (straight) {
    const d = 'M50 2 V26'
    return (
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"
           data-branch="straight"
           className="w-full h-7 overflow-visible text-line-2">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5"
              vectorEffect="non-scaling-stroke" strokeDasharray="5 4"
              className="motion-safe:animate-[branch-drift_2.4s_linear_infinite]" />
        <path key={dart} d={d} fill="none" stroke="var(--color-brand)" strokeWidth="2"
              vectorEffect="non-scaling-stroke" strokeDasharray="14 240"
              style={{ animationDelay: `${delay}ms` }}
              className="opacity-0 motion-safe:animate-[branch-dart_0.7s_cubic-bezier(.4,0,.2,1)_both]" />
      </svg>
    )
  }

  // Fork/join: three independent arms so each dart flows in the correct
  // direction. A single compound path forces one stroke-dashoffset direction
  // on the whole shape, which makes one horizontal arm animate backwards.
  const bg = join
    ? 'M25 2 V14 H75 V2 M50 14 V26'
    : 'M50 2 V14 M25 26 V14 H75 V26'

  // Dart paths drawn so the stroke-dashoffset 240->0 sweep follows the flow.
  // Fork: stem drops, then each arm leaves the center toward its column.
  // Join: each arm arrives from its column toward the center, then stem drops.
  const stem  = join ? 'M50 14 V26' : 'M50 2 V14'
  const left  = join ? 'M25 2 V14 H50' : 'M50 14 H25 V26'
  const right = join ? 'M75 2 V14 H50' : 'M50 14 H75 V26'

  const dartCls = 'opacity-0 motion-safe:animate-[branch-dart_0.7s_cubic-bezier(.4,0,.2,1)_both]'
  const dartProps = {
    fill: 'none', stroke: 'var(--color-brand)', strokeWidth: 2,
    vectorEffect: 'non-scaling-stroke', strokeDasharray: '14 240',
  }

  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"
         data-branch={join ? 'join' : 'fork'}
         className="w-full h-7 overflow-visible text-line-2">
      <path d={bg} fill="none" stroke="currentColor" strokeWidth="1.5"
            vectorEffect="non-scaling-stroke" strokeDasharray="5 4"
            className="motion-safe:animate-[branch-drift_2.4s_linear_infinite]" />
      <path key={`${dart}-s`} d={stem}  {...dartProps}
            style={{ animationDelay: `${delay}ms` }} className={dartCls} />
      <path key={`${dart}-l`} d={left}  {...dartProps}
            style={{ animationDelay: `${delay + 80}ms` }} className={dartCls} />
      <path key={`${dart}-r`} d={right} {...dartProps}
            style={{ animationDelay: `${delay + 80}ms` }} className={dartCls} />
    </svg>
  )
}

export function Node({ kind, name, body, ms, tone = 'neutral', chip, boundary,
                       dart, delay = 0, className = '', format }) {
  return (
    <div key={dart}
         style={{ animationDelay: `${delay}ms` }}
         className={`relative bg-card border ${TONE[tone]} rounded-md px-3 py-2.5
                     min-w-0 shadow-sm ${className}
                     motion-safe:animate-[node-wake_1.1s_ease-out_both]`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">{kind}</p>
        {ms !== undefined && format && (
          <span className="text-[10px] font-bold text-brand-ink tabular-nums">{format(ms)}</span>
        )}
      </div>
      <p className="text-[12.5px] font-semibold text-ink mt-0.5">{name}</p>
      <div className="text-[11px] leading-relaxed text-ink-2 mt-1">{body}</div>
      {chip && <div className="mt-2">{chip}</div>}
      {boundary && (
        <p className="flex items-center gap-1.5 mt-2 pt-2 border-t border-line
                      text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
          {boundary === 'phi' ? <Lock size={11} aria-hidden="true" />
                              : <Send size={11} aria-hidden="true" />}
          {boundary === 'phi' ? 'The record as it arrived, on this machine'
                              : 'A de-identified copy only'}
        </p>
      )}
    </div>
  )
}

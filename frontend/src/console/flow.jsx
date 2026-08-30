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

// Dashes drifting along the edge: the graph reads as something running rather
// than a picture of it. Written out rather than composed, because Tailwind
// extracts class names statically.
const EDGE = 'h-0.5 w-12 self-center bg-repeat-x '
  + 'bg-[linear-gradient(90deg,var(--color-line-2)_58%,transparent_58%)] '
  + 'bg-[length:12px_100%] motion-safe:animate-[edge-drift-x_2.4s_linear_infinite]'

/** One edge between two nodes. `dart` replays whenever its key changes. */
export function Edge({ dart, delay = 0 }) {
  return (
    <div aria-hidden="true" className={`relative shrink-0 ${EDGE}`}>
      <span key={dart} style={{ animationDelay: `${delay}ms` }}
            className="absolute -top-1 size-2.5 rounded-full bg-brand opacity-0
                       shadow-[0_0_10px_2px_var(--color-brand)] blur-[0.5px]
                       motion-safe:animate-[edge-dart-x_0.7s_cubic-bezier(.4,0,.2,1)_both]" />
    </div>
  )
}

/**
 * The vertical runs between stacked stages, drawn as one stretched SVG so the
 * geometry survives any column width: the fork after redaction, the join
 * before fusion, and a straight drop where one stage simply feeds the next.
 */
export function Branch({ join = false, straight = false, dart, delay = 0 }) {
  // The paths sit in a two-column grid, so the branch drops have to land on
  // 25% and 75% to meet the middle of each node rather than near it.
  const d = straight ? 'M50 2 V26'
    : join
    ? 'M25 2 V14 H75 V2 M50 14 V26'
    : 'M50 2 V14 M25 26 V14 H75 V26'
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"
         data-branch={straight ? 'straight' : join ? 'join' : 'fork'}
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

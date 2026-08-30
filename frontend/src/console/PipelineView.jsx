import { useEffect, useRef, useState } from 'react'
import { Lock, Send } from 'lucide-react'
import * as api from '../api'
import ActivityLog from './ActivityLog'
import { Card, CardHead, Empty, Pill } from './ui'
import { fmt, fmtMs as ms } from './format'

// The pipeline that produced the selected patient's recommendation, drawn as
// the graph it actually is and with the time each stage really took. Every
// number here is measured, not modelled: the graph nodes are wrapped and their
// wall time rides on the queue entry.
//
// The shape matters as much as the numbers. After redaction the two paths run
// as concurrent branches and rejoin at fusion, and only one of them ever sees
// a de-identified copy. Drawing them in a single line would misstate both, so
// the fork and the join are real edges rather than a caption.

// Generous on purpose: scrolling the page down should land on a useful slab of
// the log, with its own scroll reserved for going further back in the shift.
// It still grows past this when the graph leaves room.
const LOG_MIN_HEIGHT = 420

const TONE = {
  neutral: 'border-line', brand: 'border-brand-line',
  ok: 'border-ok-line', warn: 'border-warn-line',
}

// Dashes drifting along the edge: the graph reads as something running rather
// than a picture of it. Written out rather than composed, because Tailwind
// extracts class names statically.
const EDGE = 'h-0.5 w-12 self-center bg-repeat-x '
  + 'bg-[linear-gradient(90deg,var(--color-line-2)_58%,transparent_58%)] '
  + 'bg-[length:12px_100%] motion-safe:animate-[edge-drift-x_.9s_linear_infinite]'

/** One edge between two nodes. `dart` replays whenever its key changes. */
function Edge({ dart }) {
  return (
    <div aria-hidden="true" className={`relative shrink-0 ${EDGE}`}>
      <span key={dart}
            className="absolute -top-0.5 size-1.5 rounded-full bg-brand opacity-0
                       shadow-[0_0_6px_var(--color-brand)]
                       motion-safe:animate-[edge-dart-x_.75s_ease-in_1]" />
    </div>
  )
}

/**
 * The fork after redaction and the join before fusion, drawn as one stretched
 * SVG so the branch geometry survives any column width.
 */
function Branch({ join = false, dart }) {
  // The paths sit in a two-column grid, so the branch drops have to land on
  // 25% and 75% to meet the middle of each node rather than near it.
  const d = join
    ? 'M25 2 V14 H75 V2 M50 14 V26'
    : 'M50 2 V14 M25 26 V14 H75 V26'
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"
         data-branch={join ? 'join' : 'fork'}
         className="w-full h-7 overflow-visible text-line-2">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5"
            vectorEffect="non-scaling-stroke" strokeDasharray="5 4"
            className="motion-safe:animate-[branch-drift_.9s_linear_infinite]" />
      <path key={dart} d={d} fill="none" stroke="var(--color-brand)" strokeWidth="2"
            vectorEffect="non-scaling-stroke" strokeDasharray="14 240"
            className="opacity-0 motion-safe:animate-[branch-dart_.75s_ease-in_1]" />
    </svg>
  )
}

function Node({ kind, name, body, ms: cost, tone = 'neutral', chip, boundary,
                className = '' }) {
  return (
    <div className={`relative bg-card border ${TONE[tone]} rounded-md px-3 py-2.5
                     min-w-0 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">{kind}</p>
        {cost !== undefined && (
          <span className="text-[10px] font-bold text-brand-ink tabular-nums">{ms(cost)}</span>
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

function ShiftStrip({ metrics }) {
  const cells = [
    ['Patients scored', metrics?.latency?.n ?? 0],
    ['Median pipeline', `${fmt(metrics?.latency?.p50_ms)} ms`],
    ['95th percentile', `${fmt(metrics?.latency?.p95_ms)} ms`],
    ['Deferred reasoning queued', metrics?.state?.pending_enrichment ?? 0],
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line rounded-md overflow-hidden">
      {cells.map(([label, value]) => (
        <div key={label} className="bg-card px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">{label}</p>
          <p className="text-xl font-bold text-ink tabular-nums mt-0.5">{value}</p>
        </div>
      ))}
    </div>
  )
}

export default function PipelineView({ detail, metrics, refreshKey }) {
  const pl = detail?.pipeline
  const fused = detail?.fused
  const [llmNote, setLlmNote] = useState(null)

  // The registry computes this caveat so the Path B figure is not read as
  // inference time. It is the same number on this screen, so it carries the
  // same caveat rather than leaving one view honest and the other bare.
  useEffect(() => {
    api.getRegistry()
      .then((r) => setLlmNote(r.components.find((c) => c.id === 'clinical_reasoning')
                              ?.latency_note ?? null))
      .catch(() => {})
  }, [])

  // One dart runs the graph each time a patient is actually scored. Keyed off
  // the scored count rather than the refresh key, which also ticks for a clock
  // advance that put nothing through the pipeline.
  const scored = metrics?.latency?.n ?? 0
  const [dart, setDart] = useState(0)
  const seen = useRef(scored)
  useEffect(() => {
    if (scored > seen.current) setDart((d) => d + 1)
    seen.current = scored
  }, [scored])

  return (
    <div className="h-full flex flex-col gap-3 min-h-0 overflow-y-auto">
      <ShiftStrip metrics={metrics} />

      {/* The graph takes whatever height it needs and never scrolls inside
          itself: a flow chart cut in half is not a flow chart. */}
      <div className="shrink-0">
        <Card>
          <CardHead
            title="Intake pipeline"
            note={detail
              ? `The run that produced the standing recommendation for ${detail.intake.display_name ?? detail.intake.patient_id}`
              : 'Select a patient on the board to trace their triage'} />

          {!detail && <Empty>No patient selected.</Empty>}

          {detail && !pl && (
            <Empty>
              This recommendation predates pipeline tracing. Score a new arrival to
              see a full trace.
            </Empty>
          )}

          {detail && pl && (
            <div className="p-4">
              {/* Intake and redaction, in line */}
              <div className="flex items-stretch gap-0">
                <Node kind="Intake" name="Arrival record" className="flex-1 basis-0"
                      body={
                        <>
                          {detail.intake.chief_complaint}
                          <span className="block mt-1 text-ink-3">
                            {pl.classifier_ran
                              ? 'Category inferred by the intake classifier'
                              : 'Category supplied at intake'}
                          </span>
                        </>
                      } />
                <Edge dart={dart} />
                <Node kind="Redaction" name="PHI removal" tone="brand"
                      className="flex-1 basis-0" ms={pl.stage_ms?.redact}
                      boundary="phi"
                      body={
                        pl.phi_entities_removed?.length ? (
                          <span className="flex flex-wrap gap-1">
                            {pl.phi_entities_removed.map((e) => (
                              <Pill key={e} tone="brand">{e.replace(/_/g, ' ')}</Pill>
                            ))}
                          </span>
                        ) : (
                          <>Nothing identifying found in this record. The pass runs on
                            every arrival regardless.</>
                        )
                      } />
              </div>

              <p className="text-center text-[9.5px] font-bold uppercase tracking-[0.12em]
                            text-ink-3 mt-2">
                Both paths run concurrently from here
              </p>
              <Branch dart={dart} />

              {/* The two concurrent paths */}
              {/* Stretched, not natural height: the two run concurrently and
                  the join below meets both, so a short Path A and a long Path B
                  ending at different heights would leave one edge hanging. */}
              <div className="grid grid-cols-2 gap-3 items-stretch">
                <Node kind="Path A" name="ESI rules engine" tone="ok"
                      ms={pl.stage_ms?.rules} boundary="phi"
                      body={
                        <>
                          <b className="text-ink">ESI-{fused.rules.esi}</b>
                          <span className="block mt-0.5">{fused.rules.reasons[0]}</span>
                        </>
                      } />
                <Node kind="Path B" name="Clinical reasoning" boundary="deidentified"
                      tone={pl.reasoning_ran ? 'ok' : 'warn'}
                      ms={pl.stage_ms?.llm}
                      chip={
                        <span className="flex flex-col gap-1.5 items-start">
                          <Pill tone="warn">The only component that leaves this machine</Pill>
                          {llmNote && pl.reasoning_ran && (
                            <span className="text-[10.5px] leading-relaxed text-ink-3">
                              The {ms(pl.stage_ms?.llm)} above is {llmNote}.
                            </span>
                          )}
                        </span>
                      }
                      body={
                        pl.reasoning_ran ? (
                          <>
                            <b className="text-ink">ESI-{fused.llm.esi}</b>
                            <span className="block mt-0.5">{fused.llm.reasoning[0]}</span>
                          </>
                        ) : pl.surge_path ? (
                          <>Surge fast path: skipped at the door and queued for deferred
                            enrichment, never dropped.</>
                        ) : (
                          <>Did not return. The recommendation is Path A alone, which is
                            the designed fail-safe rather than a degraded result.</>
                        )
                      } />
              </div>

              <Branch join dart={dart} />
              <p className="text-center text-[9.5px] font-bold uppercase tracking-[0.12em]
                            text-ink-3 mb-2">
                Rejoined
              </p>

              {/* Fusion onward, in line */}
              <div className="flex items-stretch gap-0">
                <Node kind="Fusion" name="More acute wins" ms={pl.stage_ms?.fuse}
                      className="flex-1 basis-0" tone={fused.paths_agree ? 'ok' : 'warn'}
                      body={
                        <>
                          <b className="text-ink">ESI-{fused.esi}</b>
                          <span className="block mt-0.5">
                            {fused.paths_agree ? 'Both paths agreed'
                                               : 'Paths disagreed; the more acute level was taken'}
                          </span>
                        </>
                      } />
                <Edge dart={dart} />
                <Node kind="Calibration" name="Learned escalation" className="flex-1 basis-0"
                      body="Applies patterns clinicians have repeatedly escalated for this complaint and age band." />
                <Edge dart={dart} />
                <Node kind="Safety" name="Guards and bias" className="flex-1 basis-0"
                      tone={fused.clinician_flag ? 'warn' : 'neutral'}
                      body={fused.clinician_flag
                        ? 'Flagged for clinician review before the board shows it as settled.'
                        : 'Missing-vitals guard clear; age-band drift within range.'} />
                <Edge dart={dart} />
                <Node kind="Audit" name="Append-only write" className="flex-1 basis-0"
                      body="Both reasoning chains, the level, the confidence and the timestamp, written as the run completed." />
              </div>

              <div className="flex flex-wrap items-center gap-2 px-1 pt-3">
                <Pill tone="brand">End to end {ms(pl.total_ms)}</Pill>
                {pl.surge_path && <Pill tone="warn">Scored under surge</Pill>}
                {pl.deferred_enrichment && <Pill tone="ok">Enriched after surge</Pill>}
                {pl.retriage && <Pill tone="alert">Re-run on deterioration</Pill>}
                <span className="text-[11px] text-ink-3">
                  Stage timings are wall time measured around each graph node on this run.
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* The log runs under the graph rather than beside it: the graph is wide,
          and a supervisor reads the two together rather than choosing one. It
          takes the space the graph leaves and scrolls within itself. */}
      <div className="flex-1 min-h-0" style={{ minHeight: LOG_MIN_HEIGHT }}>
        <ActivityLog refreshKey={refreshKey} />
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import * as api from '../api'
import ActivityLog from './ActivityLog'
import { Branch, Node } from './flow'
import { AT, feed } from './flowClock'
import { Card, CardHead, Empty, Pill } from './ui'
import { fmt, fmtMs as ms } from './format'

// The pipeline that produced the selected patient's recommendation, drawn as
// the graph it actually is and with the time each stage really took. Every
// number here is measured, not modelled: the graph nodes are wrapped and their
// wall time rides on the queue entry.
//
// The shape matters as much as the numbers. It runs down one column, the way
// the product site draws the same pipeline, so the two halves of the product
// agree. The one place anything sits side by side is the concurrent pair,
// because there the geometry is making a claim: they run at the same time,
// and only one of them ever sees a de-identified copy.

// Generous on purpose: scrolling the page down should land on a useful slab of
// the log, with its own scroll reserved for going further back in the shift.
// It still grows past this when the graph leaves room.
const LOG_MIN_HEIGHT = 420

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
            /* Held to a reading measure and centred, the way the product site
               draws the same graph. Stretched to the full card, a one-line
               stage reads as an empty slab and the fork splays so wide the
               two paths stop looking like a pair. */
            <div className="p-4 max-w-3xl mx-auto">
              <Node kind="Intake" dart={dart} delay={AT.intake} name="Arrival record"
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
              <Branch straight dart={dart} delay={feed(AT.redact)} />
              <Node kind="Redaction" dart={dart} delay={AT.redact} name="PHI removal" tone="brand"
                      format={ms} ms={pl.stage_ms?.redact}
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

              <p className="text-center text-[9.5px] font-bold uppercase tracking-[0.12em]
                            text-ink-3 mt-2">
                Both paths run concurrently from here
              </p>
              <Branch dart={dart} delay={feed(AT.paths)} />

              {/* The two concurrent paths */}
              {/* Stretched, not natural height: the two run concurrently and
                  the join below meets both, so a short Path A and a long Path B
                  ending at different heights would leave one edge hanging. */}
              <div className="grid grid-cols-2 gap-3 items-stretch">
                <Node kind="Path A" dart={dart} delay={AT.paths} name="ESI rules engine" tone="ok"
                      format={ms} ms={pl.stage_ms?.rules} boundary="phi"
                      body={
                        <>
                          <b className="text-ink">ESI-{fused.rules.esi}</b>
                          <span className="block mt-0.5">{fused.rules.reasons[0]}</span>
                        </>
                      } />
                <Node kind="Path B" dart={dart} delay={AT.paths} name="Clinical reasoning" boundary="deidentified"
                      tone={pl.reasoning_ran ? 'ok' : 'warn'}
                      format={ms} ms={pl.stage_ms?.llm}
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

              <Branch join dart={dart} delay={feed(AT.fuse)} />
              <p className="text-center text-[9.5px] font-bold uppercase tracking-[0.12em]
                            text-ink-3 mb-2">
                Rejoined
              </p>

              <Node kind="Fusion" dart={dart} delay={AT.fuse} name="More acute wins" format={ms} ms={pl.stage_ms?.fuse}
                      tone={fused.paths_agree ? 'ok' : 'warn'}
                      body={
                        <>
                          <b className="text-ink">ESI-{fused.esi}</b>
                          <span className="block mt-0.5">
                            {/* fuse() reports no agreement when there was no
                                second path at all. Calling that a disagreement
                                says two engines reached different levels when
                                only one of them ran. */}
                            {!fused.llm ? 'No second level to weigh; the rules level stands'
                              : fused.paths_agree ? 'Both paths agreed'
                              : 'Paths disagreed; the more acute level was taken'}
                          </span>
                        </>
                      } />
              <Branch straight dart={dart} delay={feed(AT.calibrate)} />
              <Node kind="Calibration" dart={dart} delay={AT.calibrate} name="Learned escalation"
                    body="Applies patterns clinicians have repeatedly escalated for this complaint and age band." />
              <Branch straight dart={dart} delay={feed(AT.safety)} />
              <Node kind="Safety" dart={dart} delay={AT.safety} name="Guards and bias"
                    tone={fused.clinician_flag ? 'warn' : 'neutral'}
                    body={fused.clinician_flag
                      ? 'Flagged for clinician review before the board shows it as settled.'
                      : 'Missing-vitals guard clear; age-band drift within range.'} />
              <Branch straight dart={dart} delay={feed(AT.audit)} />
              <Node kind="Audit" dart={dart} delay={AT.audit} name="Append-only write"
                    body="Both reasoning chains, the level, the confidence and the timestamp, written as the run completed." />

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

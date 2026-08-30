import { useEffect, useState } from 'react'
import { ArrowRight, CornerDownRight, Lock, Send } from 'lucide-react'
import * as api from '../api'
import ActivityLog from './ActivityLog'
import Splitter from './Splitter'
import { usePaneWidth } from './usePaneWidth'
import { Card, CardHead, Empty, Pill } from './ui'
import { fmt } from './format'

const LOG_MIN = 280
const LOG_MAX = 620

// The pipeline that produced the selected patient's recommendation, with the
// time each stage actually took. Every number here is measured, not modelled:
// the graph nodes are wrapped and their wall time rides on the queue entry.
//
// The shape matters as much as the numbers. After redaction the two paths run
// as concurrent branches and rejoin at fusion, and only one of them ever sees
// a de-identified copy. Drawing them in a single line would misstate both.

const ms = (v) => (v == null ? '·' : `${Number(v).toFixed(v < 10 ? 1 : 0)} ms`)

const TONE = {
  neutral: 'border-line', brand: 'border-brand-line',
  ok: 'border-ok-line', warn: 'border-warn-line',
}

function Stage({ kind, name, body, ms: cost, tone = 'neutral', chip, className = '' }) {
  return (
    <div className={`bg-card border ${TONE[tone]} rounded-md px-3 py-2.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">{kind}</p>
        {cost !== undefined && (
          <span className="text-[10px] font-bold text-brand-ink tabular-nums">{ms(cost)}</span>
        )}
      </div>
      <p className="text-[12.5px] font-semibold text-ink mt-0.5">{name}</p>
      <div className="text-[11px] leading-relaxed text-ink-2 mt-1">{body}</div>
      {chip && <div className="mt-2">{chip}</div>}
    </div>
  )
}

const Arrow = () => (
  <ArrowRight size={16} className="text-ink-3 shrink-0 self-center hidden lg:block"
              aria-hidden="true" />
)

function Lane({ label, tone, children }) {
  return (
    <div className={`rounded-lg border-2 border-dashed p-3
                     ${tone === 'phi' ? 'border-brand-line bg-brand-tint/30'
                                      : 'border-line-2 bg-app'}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase
                    tracking-[0.12em] text-ink-2 mb-2.5">
        {tone === 'phi' ? <Lock size={12} aria-hidden="true" />
                        : <Send size={12} aria-hidden="true" />}
        {label}
      </p>
      {children}
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
  const [logWidth, setLogWidth] = usePaneWidth('pt.pipelog.width', 380, LOG_MIN, LOG_MAX)
  // The registry computes this caveat so the Path B figure is not read as
  // inference time. It is the same number on this screen, so it carries the
  // same caveat rather than leaving one view honest and the other bare.
  const [llmNote, setLlmNote] = useState(null)

  useEffect(() => {
    api.getRegistry()
      .then((r) => setLlmNote(r.components.find((c) => c.id === 'clinical_reasoning')
                              ?.latency_note ?? null))
      .catch(() => {})
  }, [])

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <ShiftStrip metrics={metrics} />

      <div className="flex-1 flex min-h-0 gap-0">
      <div className="flex-1 min-w-0 overflow-y-auto">
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
          <div className="p-4 space-y-3">
            <div className="flex flex-col lg:flex-row gap-2">
              <Stage kind="Intake" name="Arrival record" className="lg:w-[300px] shrink-0"
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
              <Arrow />
              <Stage kind="Redaction" name="PHI removal" tone="brand" className="flex-1"
                     ms={pl.stage_ms?.redact}
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

            <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase
                          tracking-[0.1em] text-ink-3 pl-1">
              <CornerDownRight size={13} aria-hidden="true" />
              Both paths run concurrently from here
            </p>

            <div className="grid lg:grid-cols-2 gap-2 items-start">
              <Lane tone="phi" label="Runs on the record as it arrived, on this machine">
                <Stage kind="Path A" name="ESI rules engine" tone="ok"
                       ms={pl.stage_ms?.rules}
                       body={
                         <>
                           <b className="text-ink">ESI-{fused.rules.esi}</b>
                           <span className="block mt-0.5">{fused.rules.reasons[0]}</span>
                         </>
                       } />
              </Lane>

              <Lane label="Receives a de-identified copy only">
                <Stage kind="Path B" name="Clinical reasoning"
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
              </Lane>
            </div>

            <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase
                          tracking-[0.1em] text-ink-3 pl-1">
              <CornerDownRight size={13} className="-scale-y-100" aria-hidden="true" />
              Rejoined
            </p>

            <div className="flex flex-col lg:flex-row gap-2 items-stretch">
              <Stage kind="Fusion" name="More acute wins" ms={pl.stage_ms?.fuse}
                     className="flex-1" tone={fused.paths_agree ? 'ok' : 'warn'}
                     body={
                       <>
                         <b className="text-ink">ESI-{fused.esi}</b>
                         <span className="block mt-0.5">
                           {fused.paths_agree ? 'Both paths agreed'
                                              : 'Paths disagreed; the more acute level was taken'}
                         </span>
                       </>
                     } />
              <Arrow />
              <Stage kind="Calibration" name="Learned escalation" className="flex-1"
                     body="Applies patterns clinicians have repeatedly escalated for this complaint and age band." />
              <Arrow />
              <Stage kind="Safety" name="Guards and bias" className="flex-1"
                     tone={fused.clinician_flag ? 'warn' : 'neutral'}
                     body={fused.clinician_flag
                       ? 'Flagged for clinician review before the board shows it as settled.'
                       : 'Missing-vitals guard clear; age-band drift within range.'} />
              <Arrow />
              <Stage kind="Audit" name="Append-only write" className="flex-1"
                     body="Both reasoning chains, the level, the confidence and the timestamp, written as the run completed." />
            </div>

            <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
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

      <Splitter value={logWidth} min={LOG_MIN} max={LOG_MAX} side="right"
                label="Activity log width" onChange={setLogWidth}
                className="mx-2" />

      <div className="shrink-0 min-h-0" style={{ width: logWidth }}>
        <ActivityLog refreshKey={refreshKey} />
      </div>
      </div>
    </div>
  )
}

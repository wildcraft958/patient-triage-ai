import { useEffect, useState } from 'react'
import * as api from '../api'
import { AcuityChart, BiasChart } from './charts'
import { Card, CardHead, Empty, EsiBadge, Meter, Pill } from './ui'
import { fmt, shiftClock } from './format'

const pct = (v) => (v == null ? '·' : `${Number(v).toFixed(1)}%`)

// mirrors learning.loop.ESCALATE_THRESHOLD: the point where a cell stops
// being an observation and starts changing what the system recommends
const ESCALATE_AT = 0.5

const DECISIONS = {
  override: (p) => `overrode ESI-${p.original_esi} to ESI-${p.new_esi}: "${p.reason}"`,
  override_safety_flag: (p) => `acknowledged a high-risk downgrade, ESI-${p.original_esi} to ESI-${p.new_esi}`,
  acceptance: (p) => `accepted ESI-${p.esi}`,
  reassessment_check: (p) => `reassessed at the bedside after ${p.waited_min} min`,
  alert_ack: (p) => `acknowledged a ${p.kind} alert`,
}

function Stat({ label, value, note, big }) {
  return (
    <div className="bg-card px-4 py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">{label}</p>
      <p className={`font-bold text-ink tabular-nums tracking-tight mt-1
                     ${big ? 'text-4xl' : 'text-2xl'}`}>{value}</p>
      {note && <p className="text-[11px] text-ink-2 leading-snug mt-1">{note}</p>}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-line
                    last:border-0 text-[11.5px]">
      <span className="text-ink-2">{label}</span>
      <b className="text-ink tabular-nums shrink-0">{value}</b>
    </div>
  )
}

function BenchmarkCard({ bench }) {
  const rows = [
    ['Rules only', bench.configs.rules],
    ['Reasoning only', bench.configs.llm],
    ['Fused', bench.configs.fused],
  ]
  return (
    <Card>
      <CardHead title={bench.label}
                note={`${bench.n} held-out cases · ${bench.model} · scored offline, not from this shift`} />
      <table className="w-full text-[11.5px] px-4">
        <thead>
          <tr>
            {['Configuration', 'Exact', 'Under', 'High-acuity recall'].map((h, i) => (
              <th key={h} className={`text-[9.5px] font-bold uppercase tracking-wide
                                      text-ink-3 pb-2 pt-3 px-4
                                      ${i ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, c]) => (
            <tr key={label} className={label === 'Fused' ? 'font-bold text-brand-ink' : ''}>
              <td className="px-4 py-1.5 border-t border-line">{label}</td>
              <td className="px-4 py-1.5 border-t border-line text-right tabular-nums">{pct(c.exact_acc)}</td>
              <td className="px-4 py-1.5 border-t border-line text-right tabular-nums">{pct(c.under_triage)}</td>
              <td className="px-4 py-1.5 border-t border-line text-right tabular-nums">{pct(c.high_acuity_sens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="h-3" />
    </Card>
  )
}

function OverrideLog({ events, names }) {
  const rows = events.filter((e) => e.event_type === 'override').slice(-12).reverse()
  return (
    <Card>
      <CardHead title="Override log"
                note="Every acuity level a clinician changed, with the reason they gave" />
      {rows.length === 0 && <Empty>No overrides recorded yet.</Empty>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[11.5px]">
            <thead>
              <tr>
                {['Time', 'Patient', 'Original', 'Override', 'Reason', 'Clinician'].map((h, i) => (
                  <th key={h} className={`text-left text-[9.5px] font-bold uppercase
                                          tracking-wide text-ink-3 pb-2 pt-3 pr-3
                                          ${i === 0 ? 'pl-4' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="pl-4 pr-3 py-2 tabular-nums text-ink-2">{shiftClock(e.sim_min)}</td>
                  <td className="pr-3 py-2 font-semibold text-ink">
                    {names[e.patient_id] ?? e.patient_id}
                  </td>
                  <td className="pr-3 py-2"><EsiBadge esi={e.payload.original_esi} size="sm" /></td>
                  <td className="pr-3 py-2"><EsiBadge esi={e.payload.new_esi} size="sm" /></td>
                  <td className="pr-3 py-2 text-ink-2">{e.payload.reason}</td>
                  <td className="pr-3 py-2 tabular-nums text-ink-2">{e.payload.clinician_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="h-3" />
        </div>
      )}
    </Card>
  )
}

export default function Analytics({ metrics, rows, refreshKey }) {
  const [benchmarks, setBenchmarks] = useState([])
  const [events, setEvents] = useState([])

  useEffect(() => {
    api.getBenchmark().then((r) => setBenchmarks(r.benchmarks)).catch(() => {})
    api.getRecentAudit().then((r) => setEvents(r.events)).catch(() => {})
  }, [refreshKey])

  const headline = benchmarks.find((b) => b.n >= 200) ?? benchmarks[0]
  const audit = metrics?.audit
  const bands = Object.entries(metrics?.bias_by_age_band ?? {})
  const names = Object.fromEntries(rows.map((r) => [r.patient_id, r.display_name]))
  const acuity = rows.reduce((acc, r) => ({ ...acc, [r.esi]: (acc[r.esi] ?? 0) + 1 }), {})
  const decisions = events.filter((e) => DECISIONS[e.event_type]).slice(-12).reverse()
  const overridesThisShift = events.filter((e) => e.event_type === 'override').length

  return (
    <div className="space-y-3">
      {headline && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line rounded-md overflow-hidden">
          <Stat big label="Under-triage rate"
                value={pct(headline.configs.fused.under_triage)}
                note={`The metric that matters, on ${headline.n} held-out cases`} />
          <Stat label="Exact accuracy" value={pct(headline.configs.fused.exact_acc)}
                note="Level matched the reference exactly" />
          <Stat label="High-acuity recall" value={pct(headline.configs.fused.high_acuity_sens)}
                note="ESI 1 and 2 caught as ESI 1 or 2" />
          <Stat label="Overrides this shift" value={overridesThisShift}
                note="Clinicians changing a recommended level" />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-3 items-start">
        <Card>
          <CardHead title="Acuity mix this shift"
                    note={`${rows.length} patients currently on the board`} />
          <div className="px-3 py-3">
            {rows.length === 0 ? <Empty>Nobody scored yet.</Empty>
                               : <AcuityChart counts={acuity} />}
          </div>
        </Card>

        <Card>
          <CardHead title="Bias monitor"
                    note="Mean assigned acuity by age band. A band drifting away from the others is what a silent age bias looks like." />
          <div className="px-3 py-3">
            {bands.length === 0 ? <Empty>No patients scored yet.</Empty>
                                : <BiasChart bands={bands} />}
            {(metrics?.bias_alerts ?? []).map((a, i) => (
              <p key={i} className="mt-2 rounded-md border border-warn-line bg-warn-bg
                                    px-3 py-2 text-[11.5px] text-warn-ink">{a}</p>
            ))}
          </div>
        </Card>
      </div>

      <OverrideLog events={events} names={names} />

      {benchmarks.map((b) => <BenchmarkCard key={b.label} bench={b} />)}

      <div className="grid lg:grid-cols-3 gap-3 items-start">
        <Card>
          <CardHead title="Audit trail"
                    note="Append-only and survives restarts, so these totals span shifts rather than resetting with the board." />
          <div className="px-4 pb-3 pt-1">
            <Row label="Triage decisions recorded" value={audit?.events_by_type?.triage ?? 0} />
            <Row label="Clinician override rate" value={pct(audit?.override_rate_pct)} />
            <Row label="Overrides toward more acute" value={audit?.overrides_toward_more_acute ?? 0} />
            <Row label="Deterioration alerts" value={audit?.alerts_by_kind?.DETERIORATION ?? 0} />
            <Row label="Wait-limit alerts" value={audit?.alerts_by_kind?.WAIT_BREACH ?? 0} />
          </div>
        </Card>

        <Card>
          <CardHead title="Pipeline latency"
                    note={`Intake to recommendation for the ${metrics?.latency?.n ?? 0} patients scored since this process started.`} />
          <div className="px-4 pb-3 pt-1">
            <p className="text-4xl font-bold text-ink tabular-nums tracking-tight py-1">
              {fmt(metrics?.latency?.p50_ms)}
              <span className="text-sm font-semibold text-ink-3 ml-1.5">ms median</span>
            </p>
            <Row label="95th percentile" value={`${fmt(metrics?.latency?.p95_ms)} ms`} />
            <Row label="Patients scored" value={metrics?.latency?.n ?? 0} />
          </div>
        </Card>

        <Card>
          <CardHead title="Learned calibration"
                    note="Complaint and age cells where clinicians repeatedly escalated. Past the threshold, the system escalates that pattern itself." />
          <div className="px-4 pb-3 pt-1">
            {Object.keys(metrics?.calibration_cells ?? {}).length === 0 && (
              <Empty>Nothing learned yet this shift.</Empty>
            )}
            {Object.entries(metrics?.calibration_cells ?? {}).map(([cell, signal]) => (
              <div key={cell} className="py-1.5 border-b border-line last:border-0">
                <div className="flex items-baseline justify-between gap-3 text-[11.5px]">
                  <span className="text-ink-2">{cell.replace(/_/g, ' ').replace('|', ' · ')}</span>
                  <b className="text-ink shrink-0">
                    {signal >= ESCALATE_AT ? 'escalating' : `${(signal * 100).toFixed(0)}%`}
                  </b>
                </div>
                <Meter value={signal * 100} tone={signal >= ESCALATE_AT ? 'alert' : 'brand'}
                       className="mt-1" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHead title="Clinician decisions"
                  note="Every override, acknowledgment and bedside check, in order, with the badge that made it" />
        <div className="px-4 pb-3 pt-1">
          {decisions.length === 0 && <Empty>No decisions recorded yet.</Empty>}
          {decisions.map((e, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 py-1.5
                                    border-b border-line last:border-0 text-[11.5px]">
              <span className="text-ink-2">
                <b className="text-ink">{e.payload.clinician_id ?? 'system'}</b>{' '}
                {DECISIONS[e.event_type](e.payload)}
                <Pill tone="neutral" className="ml-1.5">
                  {names[e.patient_id] ?? e.patient_id}
                </Pill>
              </span>
              <b className="text-ink-3 tabular-nums shrink-0">{shiftClock(e.sim_min)}</b>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

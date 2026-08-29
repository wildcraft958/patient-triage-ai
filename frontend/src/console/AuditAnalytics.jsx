import { useEffect, useState } from 'react'
import * as api from '../api'
import { fmt } from './ui'

const pct = (v) => (v == null ? '·' : `${Number(v).toFixed(1)}%`)

// mirrors learning.loop.ESCALATE_THRESHOLD: the point where a cell stops
// being an observation and starts changing what the system recommends
const ESCALATE_AT = 0.5

const DECISION_EVENTS = {
  override: (p) => `overrode ESI-${p.original_esi} to ESI-${p.new_esi}: "${p.reason}"`,
  override_safety_flag: (p) => `acknowledged a high-risk downgrade, ESI-${p.original_esi} to ESI-${p.new_esi}`,
  acceptance: (p) => `accepted ESI-${p.esi}`,
  reassessment_check: (p) => `reassessed at the bedside after ${p.waited_min} min`,
  alert_ack: (p) => `acknowledged a ${p.kind} alert`,
}

function BenchmarkCard({ bench }) {
  const rows = [
    ['Rules only', bench.configs.rules],
    ['Reasoning only', bench.configs.llm],
    ['Fused', bench.configs.fused],
  ]
  return (
    <div className="metric-card">
      <h3>{bench.label}</h3>
      <span className="src">
        {bench.n} held-out cases · {bench.model} · scored offline, not from this shift
      </span>
      <table className="cmp-table">
        <thead>
          <tr><th>Configuration</th><th>Exact</th><th>Under</th><th>High-acuity recall</th></tr>
        </thead>
        <tbody>
          {rows.map(([label, c]) => (
            <tr key={label} className={label === 'Fused' ? 'best' : ''}>
              <td>{label}</td>
              <td>{pct(c.exact_acc)}</td>
              <td>{pct(c.under_triage)}</td>
              <td>{pct(c.high_acuity_sens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AuditAnalytics({ metrics }) {
  const [benchmarks, setBenchmarks] = useState([])
  const [events, setEvents] = useState([])

  useEffect(() => {
    api.getBenchmark().then((r) => setBenchmarks(r.benchmarks)).catch(() => {})
    api.getRecentAudit().then((r) => setEvents(r.events)).catch(() => {})
  }, [metrics])

  const headline = benchmarks.find((b) => b.n >= 200) ?? benchmarks[0]
  const audit = metrics?.audit
  const bands = Object.entries(metrics?.bias_by_age_band ?? {})
  const decisions = events
    .filter((e) => DECISION_EVENTS[e.event_type])
    .slice(-14).reverse()

  return (
    <div className="analytics">
      {headline && (
        <div className="metric-card">
          <h3>Under-triage rate</h3>
          <span className="src">
            The metric that matters: a patient scored less acute than they were.
            {' '}{headline.n} held-out cases.
          </span>
          <div className="big-stat">
            {pct(headline.configs.fused.under_triage)}<small>fused</small>
          </div>
          <div className="stat-row">
            <span>Rules engine alone</span><b>{pct(headline.configs.rules.under_triage)}</b>
          </div>
          <div className="stat-row">
            <span>Reasoning path alone</span><b>{pct(headline.configs.llm.under_triage)}</b>
          </div>
          <div className="stat-row">
            <span>Dangerous under-triage (2+ levels)</span>
            <b>{pct(headline.configs.fused.sig_under_triage)}</b>
          </div>
          <div className="stat-row">
            <span>High-acuity recall (ESI 1 and 2)</span>
            <b>{pct(headline.configs.fused.high_acuity_sens)}</b>
          </div>
        </div>
      )}

      {benchmarks.map((b) => <BenchmarkCard key={b.label} bench={b} />)}

      <div className="metric-card">
        <h3>This shift</h3>
        <span className="src">Live numbers from the running department.</span>
        <div className="stat-row">
          <span>Triage decisions</span><b>{audit?.events_by_type?.triage ?? 0}</b>
        </div>
        <div className="stat-row">
          <span>Clinician override rate</span><b>{pct(audit?.override_rate_pct)}</b>
        </div>
        <div className="stat-row">
          <span>Overrides toward more acute</span><b>{audit?.overrides_toward_more_acute ?? 0}</b>
        </div>
        <div className="stat-row">
          <span>Alerts fired</span>
          <b>{Object.values(audit?.alerts_by_kind ?? {}).reduce((a, b) => a + b, 0)}</b>
        </div>
        <div className="stat-row">
          <span>Triage latency p50 / p95</span>
          <b>{fmt(metrics?.latency?.p50_ms)} / {fmt(metrics?.latency?.p95_ms)} ms</b>
        </div>
      </div>

      <div className="metric-card">
        <h3>Bias monitor</h3>
        <span className="src">
          Mean assigned acuity by age band. A band drifting away from the others
          is what a silent age bias would look like.
        </span>
        {bands.length === 0 && <div className="empty">No patients scored yet.</div>}
        {bands.map(([band, s]) => (
          <div key={band} className="stat-row">
            <span>{band} <small>(n={s.n})</small></span>
            <b>ESI {s.mean_esi}</b>
          </div>
        ))}
        {(metrics?.bias_alerts ?? []).map((a, i) => (
          <div key={i} className="risk-warning">{a}</div>
        ))}
      </div>

      <div className="metric-card">
        <h3>Clinician decisions</h3>
        <span className="src">
          Every override, acknowledgment and bedside check, in order, with who
          made it.
        </span>
        {decisions.length === 0 && <div className="empty">No decisions recorded yet.</div>}
        {decisions.map((e, i) => (
          <div key={i} className="stat-row">
            <span>
              <b>{e.payload.clinician_id ?? 'system'}</b>{' '}
              {DECISION_EVENTS[e.event_type](e.payload)}
            </span>
            <b>{fmt(e.sim_min)}m</b>
          </div>
        ))}
      </div>

      <div className="metric-card">
        <h3>Learned calibration</h3>
        <span className="src">
          Complaint and age cells where clinicians repeatedly escalated. Once a
          cell crosses its threshold the system escalates that pattern itself.
        </span>
        {Object.keys(metrics?.calibration_cells ?? {}).length === 0 && (
          <div className="empty">Nothing learned yet this shift.</div>
        )}
        {Object.entries(metrics?.calibration_cells ?? {}).map(([cell, signal]) => (
          <div key={cell} className="stat-row">
            <span>
              {cell.replace(/_/g, ' ').replace('|', ' · ')}
              <div className="bar-track" style={{ width: 120 }}>
                <i className={signal >= ESCALATE_AT ? 'bad' : ''}
                   style={{ width: `${signal * 100}%` }} />
              </div>
            </span>
            <b>{signal >= ESCALATE_AT ? 'escalating' : `${(signal * 100).toFixed(0)}%`}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

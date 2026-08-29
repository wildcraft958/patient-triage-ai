import { useState } from 'react'
import * as api from '../api'
import { ConfMeter, EsiBadge, Sparkline, VITAL_DEFS, fmt, fmtAge } from './ui'

function AuditDrawer({ patientId }) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState(null)

  const toggle = async () => {
    if (!open && events === null) {
      const r = await api.getAudit(patientId).catch(() => ({ events: [] }))
      setEvents(r.events)
    }
    setOpen(!open)
  }

  const summary = (e) => {
    const p = e.payload
    if (e.event_type === 'triage') return `ESI-${p.esi} · ${p.confidence} confidence · ${p.paths_agree ? 'paths agree' : 'paths disagree'}`
    if (e.event_type === 'alert') return `${p.kind}: ${(p.reasons || []).join('; ')}`
    if (e.event_type === 'alert_ack') return `${p.kind} alert acknowledged by ${p.clinician_id}`
    if (e.event_type === 'reassessment') return `ESI-${p.previous_esi} re-triaged to ESI-${p.new_esi} (${p.trigger})`
    if (e.event_type === 'reassessment_check') return `bedside check by ${p.clinician_id} after ${p.waited_min} min unassessed`
    if (e.event_type === 'override') return `ESI-${p.original_esi} to ESI-${p.new_esi} by ${p.clinician_id}: "${p.reason}"`
    if (e.event_type === 'override_safety_flag') return `high-risk downgrade acknowledged by ${p.clinician_id}`
    if (e.event_type === 'reward') return `reward ${p.reward} (${p.under_triage ? 'under-triage signal' : 'over-triage'})`
    if (e.event_type === 'acceptance') return `accepted ESI-${p.esi} by ${p.clinician_id} · reward +${p.reward}`
    if (e.event_type === 'surge_enrichment') return `deferred reasoning: ${p.outcome ?? `ESI-${p.previous_esi} to ESI-${p.new_esi}`}`
    return JSON.stringify(p).slice(0, 80)
  }

  return (
    <div className="audit-drawer">
      <button className="btn btn-outline" onClick={toggle}>
        {open ? 'Hide audit trail' : 'Audit trail'}
      </button>
      {open && events && (
        <div style={{ marginTop: 8 }}>
          {events.map((e, i) => (
            <div key={i} className="audit-row">
              <span className="t">t={fmt(e.sim_min)}</span>
              <span className="et">{e.event_type.replace(/_/g, ' ')}</span>
              <span className="pl">{summary(e)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Vitals({ history }) {
  if (!history?.length) return null
  const baseline = history[0].vitals
  const latest = history[history.length - 1].vitals
  return (
    <>
      <div className="vitals-grid">
        {VITAL_DEFS.map(({ key, label, unit, worseIfUp }) => {
          const now = latest[key]
          if (now == null) return null
          const base = baseline[key]
          const delta = base != null ? now - base : 0
          const worse = (worseIfUp ? delta > 0 : delta < 0) && Math.abs(delta) >= 1
          return (
            <div key={key} className={`vcell ${worse ? 'worse' : ''}`}>
              <div className="vlbl">{label}</div>
              <div className="vfoot">
                <span className="vnow">
                  {Number(now).toFixed(key === 'temp_c' ? 1 : 0)}{unit}
                </span>
                <Sparkline values={history.map((h) => h.vitals[key])} worseIfUp={worseIfUp} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="notes">
        {history.length > 1
          ? `${history.length} readings since triage`
          : 'Single reading at triage'}
      </div>
    </>
  )
}

function BeliefStrip({ belief }) {
  if (!belief || belief.length !== 5) return null
  return (
    <div className="belief">
      <span className="belief-lbl">Acuity belief P(ESI)</span>
      {belief.map((p, i) => (
        <div key={i} className="belief-col"
             title={`P(true acuity is ESI-${i + 1}) = ${(p * 100).toFixed(0)}%`}>
          <div className="belief-bar" style={{ height: `${Math.max(2, p * 34)}px` }} />
          <span>{i + 1}</span>
        </div>
      ))}
    </div>
  )
}

function Paths({ fused }) {
  return (
    <div className="paths">
      <div className="path">
        <h4>Path A · ESI rules engine</h4>
        <div className="verdict">ESI-{fused.rules.esi}</div>
        <ul>{fused.rules.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </div>
      {fused.llm ? (
        <div className="path">
          <h4>Path B · clinical reasoning</h4>
          <div className="verdict">
            ESI-{fused.llm.esi}
            <span className="pill" style={{ marginLeft: 6 }}>
              self-rated {(fused.llm.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <ul>{fused.llm.reasoning.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      ) : (
        <div className="path muted">
          <h4>Path B · clinical reasoning</h4>
          <div className="verdict">Not run</div>
          Rules-only fast path: the deterministic engine carries this triage
          on its own, and the reasoning pass is queued rather than skipped.
        </div>
      )}
    </div>
  )
}

export default function TriageCard({ detail, feedback, busy,
                                     onAccept, onOverride, onReassess }) {
  if (!detail) {
    return (
      <div className="panel">
        <h2>Triage recommendation</h2>
        <div className="empty">Select a patient from the board.</div>
      </div>
    )
  }

  const { intake, fused, status, waited_min, vitals_history, decided_by } = detail
  const inTreatment = status === 'in_treatment'
  const disagreeNote = fused.notes.find((n) => n.startsWith('Paths disagree'))

  return (
    <div className="panel">
      <h2>Triage recommendation</h2>
      <div className="card">
        <div className="tc-head">
          <div className="tc-name">
            {intake.display_name ?? intake.patient_id}
            <span className="rec">
              {fmtAge(intake.age_years, intake.age_months)} · record {intake.patient_id}
            </span>
          </div>
          <div className="tc-when">
            {inTreatment ? 'In care' : `${Math.round(waited_min)} min since assessment`}
            <br />responsiveness {intake.responsiveness}
          </div>
        </div>
        <div className="tc-complaint">{intake.chief_complaint}</div>
        <div className="sub">
          {intake.has_history
            ? `On file: ${[...intake.conditions, ...intake.medications].join(', ') || 'record exists'}`
            : 'No prior record (first visit)'}
        </div>

        <div className={`rec-band ${fused.clinician_flag ? 'flagged' : ''}`}>
          <EsiBadge esi={fused.esi} big />
          <span className="route">{fused.route}</span>
          <span className="pill">
            {fused.confidence} confidence<ConfMeter level={fused.confidence} />
          </span>
          <span className="pill">
            {fused.paths_agree
              ? <span className="agree-word">paths agree</span>
              : <span className="disagree-word">paths disagree</span>}
          </span>
          {fused.clinician_flag && <span className="pill flag">REVIEW</span>}
          {detail.icd10 && <span className="pill">ICD-10 {detail.icd10.code}</span>}
        </div>

        {disagreeNote && <div className="disagree-banner">{disagreeNote}</div>}

        <Paths fused={fused} />

        <div className="notes">
          {fused.notes.filter((n) => n !== disagreeNote).map((n, i) => <div key={i}>· {n}</div>)}
        </div>

        <Vitals history={vitals_history} />
        <BeliefStrip belief={detail.belief} />

        {decided_by && (
          <div className="decided">
            Level set by <b>{decided_by}</b>. Automated paths may advise from here,
            but they will not change it.
          </div>
        )}

        {!inTreatment && (
          <div className="actions">
            <button className="btn btn-accept" disabled={busy}
                    onClick={() => onAccept(intake.patient_id)}>
              Accept ESI-{fused.esi}
            </button>
            <button className="btn btn-outline" disabled={busy} onClick={onOverride}>
              Override level
            </button>
            <button className="btn btn-outline" disabled={busy}
                    onClick={() => onReassess(intake.patient_id)}>
              Reassess now
            </button>
          </div>
        )}
        {feedback && <div className="decided">{feedback}</div>}

        <AuditDrawer key={intake.patient_id} patientId={intake.patient_id} />
      </div>
    </div>
  )
}
